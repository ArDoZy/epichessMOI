// ================================================================
// LEADERBOARD.JS : le classement général, la recherche, les profils
// ================================================================
// LE JEU N'AVAIT PAS D'AUTRES JOUEURS. Chacun avait un ELO que personne
// ne voyait, calculé par son propre navigateur, comparé à rien. Une
// progression sans témoin n'est pas une progression : c'est un compteur.
//
// Cette page apporte les trois choses qui manquaient, et elles tiennent
// toutes les trois dans le même écran parce qu'elles répondent à la
// même question — « qui d'autre joue à ça ? » :
//
//   1. LE CLASSEMENT GÉNÉRAL. Tous les comptes, du meilleur ELO au
//      moins bon, ma propre ligne surlignée et rejointe d'un bouton.
//      Les comptes admin n'y figurent pas (ils jouent avec tout
//      débloqué et 10 000 ELO : les compter n'aurait aucun sens), ni
//      les comptes sans une seule partie classée — un classement se
//      gagne, il ne s'obtient pas en créant un compte.
//
//   2. LA RECHERCHE. Un champ, et les joueurs EN LIGNE d'abord : on
//      cherche quelqu'un pour le défier, autant voir tout de suite qui
//      est disponible.
//
//   3. LE PROFIL D'UN JOUEUR. Son rang, son ELO, son sommet, ses
//      parties, son taux de victoire, sa meilleure série, sa créature
//      fétiche — et surtout CE QU'IL PEUT ALIGNER : son armée choisie,
//      ses pièces débloquées, ses pouvoirs, puis ses dix dernières
//      parties, REJOUABLES coup par coup (js/replay.js). Exactement ce
//      que la page Comptes montre du sien. Et, s'il est en ligne, le
//      bouton qui le DÉFIE : le classement mène au jeu, il ne s'y
//      substitue pas.
//
//      POURQUOI L'ARMÉE Y FIGURE. On partait au duel sans la moindre
//      idée de ce qu'on allait avoir en face, alors que c'est justement
//      l'armée qui distingue deux joueurs de même niveau — et elle se
//      voit de toute façon au premier coup de la partie. Ce qui reste
//      privé (l'inventaire, les perles, la progression des voies) ne
//      sort pas du serveur : voir ec_public, supabase/schema.sql.
//
// -- EN LIGNE OU PAS : DEUX SOURCES, ET C'EST VOULU ---------------
// Le serveur donne un `online` calculé sur last_seen_at, qui a jusqu'à
// trente secondes de retard (le battement de ec_touch). La présence
// Realtime (mpOnlineIds, js/multiplayer.js), elle, est instantanée mais
// peut manquer quelqu'un dont le canal se rétablit. On allume donc la
// pastille si L'UNE OU L'AUTRE dit oui : un faux « hors ligne » coûte
// un défi qu'on n'ose pas lancer, un faux « en ligne » coûte trente
// secondes d'attente.
//
// Dépendances : server.js (ecLeaderboard, ecSearchPlayers, ecProfileOf,
// ECP), multiplayer.js (mpIsOnline, mpChallenge, MP.duelOut),
// data-pieces.js (vvGetRank, PIECES), piece-art.js (pieceIcon),
// main.js (escH, showPage, showNotif), pages-nav.js (goToMainMenu).
// Utilisé par : le menu principal (bouton « Classement »), la page
// Comptes (la pastille « #N mondial »).
// ================================================================

const LB_PAGE='page-classement';
const LB_PAGE_SIZE=50;

let _lbRows=[];        // le classement tel que le serveur l'a donné
let _lbTotal=0;
let _lbSearch='';      // la recherche en cours (vide = classement)
let _lbSearchRows=null;// résultats de recherche (null = pas de recherche)
let _lbProfile=null;   // profil ouvert (null = liste)
let _lbLoading=false;
let _lbSearchTid=null;
let _lbTab='top';      // 'top' : le classement ; 'friends' : mes amis

// ----------------------------------------------------------------
// LES AMIS
// ----------------------------------------------------------------
// On défiait quelqu'un en le cherchant par son nom, à chaque fois : le
// joueur contre qui l'on veut rejouer, c'est presque toujours le même. La
// liste d'amis le garde sous la main, avec sa pastille de présence et son
// bouton « Défier » sur la ligne même.
//
// C'EST UNE LISTE DE CONTACTS, PAS UNE AMITIÉ À DEUX SIGNATURES. Ajouter
// quelqu'un ne lui demande rien et ne lui apprend rien : il n'y a pas de
// demande à accepter, donc pas de table serveur, pas de notification à
// porter, pas de spam possible. Elle vit dans la fiche du compte
// (`friends`, accGet/accSet), comme n'importe quelle préférence — et le défi,
// lui, reste ce qu'il était : une invitation qu'on accepte ou non
// (mpChallenge, js/multiplayer.js).
//
// Ce qui s'affiche d'un ami (ELO, rang, présence) est relu sur son profil
// public à l'ouverture de l'onglet (lbFriendsRefresh), et gardé une minute.
const LB_FRIENDS_MAX=50;
const LB_FRIEND_TTL=60000;
let _lbFriendCache={};  // id → {at, row}
function friendsList(){
  const l=(typeof accGet==='function')?accGet('friends',[]):[];
  return Array.isArray(l)?l.filter(f=>f&&f.id):[];
}
function isFriend(id){return friendsList().some(f=>f.id===id);}
function friendAdd(id,name){
  if(!id)return false;
  if(typeof ECP!=='undefined'&&ECP&&id===ECP.id)return false;
  const l=friendsList();
  if(l.some(f=>f.id===id))return true;
  if(l.length>=LB_FRIENDS_MAX){showNotif('Votre liste d\'amis est pleine ('+LB_FRIENDS_MAX+').','err');return false;}
  l.push({id,name:String(name||'').slice(0,40),at:Date.now()});
  accSet('friends',l);
  showNotif((name||'Ce joueur')+' est dans vos amis.','ok');
  return true;
}
function friendRemove(id){
  const l=friendsList().filter(f=>f.id!==id);
  accSet('friends',l);delete _lbFriendCache[id];
}
// Relit le profil public de chaque ami dont la fiche a plus d'une minute. Un
// ami renommé garde sa place : c'est son identifiant qui est retenu, et le
// nouveau pseudo remplace l'ancien dans la liste.
function lbFriendsRefresh(){
  if(typeof ecProfileOf!=='function')return;
  const now=Date.now();
  const stale=friendsList().filter(f=>!_lbFriendCache[f.id]||now-_lbFriendCache[f.id].at>LB_FRIEND_TTL);
  if(!stale.length)return;
  Promise.all(stale.map(f=>ecProfileOf({id:f.id}).then(p=>{
    if(p&&p.found){
      _lbFriendCache[f.id]={at:Date.now(),row:p};
      if(p.username&&p.username!==f.name){
        const l=friendsList();const e=l.find(x=>x.id===f.id);
        if(e){e.name=p.username;accSet('friends',l);}
      }
    }else _lbFriendCache[f.id]={at:Date.now(),row:null,gone:true};
  }).catch(()=>{}))).then(()=>{if(_lbTab==='friends'&&!_lbProfile)renderLeaderboardPage();});
}
function lbFriendsHTML(){
  const l=friendsList();
  if(!l.length)
    return '<p class="lb-empty">Aucun ami pour l\'instant. Cherchez un joueur ci-dessus ou ouvrez un profil '+
      'du classement, puis touchez « Ajouter en ami ».</p>';
  // En ligne d'abord : c'est eux qu'on peut défier maintenant.
  const rows=l.map(f=>{
    const c=_lbFriendCache[f.id];
    return (c&&c.row)?c.row:{id:f.id,username:f.name,elo:0,elo_peak:0,ranked_games:0,_pending:!c,_gone:!!(c&&c.gone)};
  });
  rows.sort((a,b)=>(lbOnline(b)?1:0)-(lbOnline(a)?1:0)||(b.elo|0)-(a.elo|0));
  return '<div class="lb-count">'+l.length+(l.length>1?' amis':' ami')+'</div>'+
    '<div class="lb-list">'+rows.map(r=>lbRowHTML(r,false,{friend:true})).join('')+'</div>';
}

// ----------------------------------------------------------------
// OUVERTURE / FERMETURE
// ----------------------------------------------------------------
function openLeaderboardPage(tab){
  document.getElementById('settings-panel')?.classList.remove('open');
  _lbProfile=null;
  if(tab==='friends'||tab==='top')_lbTab=tab;
  if(_lbTab==='friends')lbFriendsRefresh();
  renderLeaderboardPage();
  showPage(LB_PAGE);
  lbLoad();
}
function closeLeaderboardPage(){
  const p=document.getElementById(LB_PAGE);
  if(!p||!p.classList.contains('active'))return;
  if(typeof goToMainMenu==='function')goToMainMenu();
  else showPage('page-builder');
}

// Le classement, rechargé à chaque ouverture. On ne le met pas en cache
// plus longtemps : un classement d'il y a dix minutes est un classement
// faux, et c'est le seul écran où l'on vient précisément pour savoir où
// l'on en est MAINTENANT.
function lbLoad(){
  _lbLoading=true;
  ecLeaderboard(LB_PAGE_SIZE,0).then(r=>{
    _lbRows=(r&&r.rows)||[];_lbTotal=(r&&r.total)||0;
    _lbLoading=false;renderLeaderboardPage();
  }).catch(e=>{
    _lbLoading=false;
    lbError((e&&e.message)||'Classement indisponible.');
  });
}

function lbError(msg){
  const host=document.getElementById('lb-body');
  if(host)host.innerHTML='<p class="lb-empty">'+escH(msg)+'</p>';
}

// ----------------------------------------------------------------
// RENDU
// ----------------------------------------------------------------
// LE CLASSEMENT NE SE RÉÉCRIT QUE S'IL A CHANGÉ.
//
// Cette fonction est rappelée à chaque arrivée ou départ dans le salon de
// présence, c'est-à-dire plusieurs fois par minute quand il y a du monde. Elle
// réécrivait la liste entière et rebranchait ses écouteurs à chaque fois —
// jusqu'à cinquante lignes, chacune avec son médaillon de rang.
//
// Et ce n'était pas qu'une dépense : c'était un BUG. Le champ de recherche fait
// partie du balisage réécrit, donc il était DÉTRUIT puis recréé au milieu d'une
// frappe. `_lbKeepFocus` existe pour recoller les morceaux (redonner le focus,
// remettre le curseur au bout) — un pansement qui ne tenait que si rien
// d'autre ne bougeait. Un rendu qui ne change rien ne touche plus au DOM du
// tout : le champ n'est plus détruit, et le pansement n'a plus à servir.
//
// La signature est le BALISAGE LUI-MÊME. Construire la chaîne coûte quelques
// concaténations ; l'analyser, la mettre en page et rebrancher ses écouteurs
// coûte cent fois plus. Comparer avant d'écrire est donc toujours gagnant, et
// c'est la seule signature qui ne peut pas se tromper — elle EST ce qu'on
// allait afficher.
let _lbHtml=null;
function renderLeaderboardPage(){
  const host=document.getElementById('lb-body');
  if(!host)return;
  const html=_lbProfile?lbProfileHTML(_lbProfile):(lbTabsHTML()+lbSearchHTML()+
    (_lbTab==='friends'&&!_lbSearchRows?lbFriendsHTML():lbListHTML()));
  if(html===_lbHtml&&host.firstElementChild)return;
  _lbHtml=html;
  host.innerHTML=html;
  lbWire();
}

// Deux onglets : le classement de tout le monde, et ses amis.
function lbTabsHTML(){
  const n=friendsList().length;
  const online=friendsList().filter(f=>{const c=_lbFriendCache[f.id];return lbOnline((c&&c.row)||{id:f.id});}).length;
  return '<div class="lb-tabs" role="tablist">'+
    '<button class="lb-tab'+(_lbTab==='top'?' on':'')+'" data-tab="top" role="tab" aria-selected="'+(_lbTab==='top')+'">Classement</button>'+
    '<button class="lb-tab'+(_lbTab==='friends'?' on':'')+'" data-tab="friends" role="tab" aria-selected="'+(_lbTab==='friends')+'">Amis'+
      (n?' <span class="lb-tab-n">'+n+'</span>':'')+(online?'<span class="lb-tab-on" title="'+online+' en ligne"></span>':'')+'</button>'+
  '</div>';
}

function lbSearchHTML(){
  return ''+
  '<div class="lb-search">'+
    '<svg class="lb-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">'+
      '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>'+
    '</svg>'+
    '<input class="acc-input lb-search-input" id="lb-search" type="search" '+
      'placeholder="Chercher un joueur" autocomplete="off" spellcheck="false" '+
      'value="'+escH(_lbSearch)+'" aria-label="Chercher un joueur">'+
    (_lbSearch?'<button class="lb-search-clear" id="lb-search-clear" aria-label="Effacer">×</button>':'')+
  '</div>';
}

// Une ligne du classement. Le numéro de place n'est pas décoratif :
// c'est la seule information de cet écran qu'on ne peut pas déduire de
// son propre profil.
// LE DÉFI SE LANCE DEPUIS LA LIGNE. Ouvrir un profil pour trouver le bouton
// « Défier » tout en bas coûtait deux gestes et un défilement : quelqu'un
// d'en ligne au classement porte son épée au bout de sa ligne, un défi en
// attente la remplace par « Annuler ». La ligne elle-même ouvre toujours le
// profil — deux boutons côte à côte, jamais l'un dans l'autre.
function lbRowDuelHTML(r,me,online){
  if(me||!online)return '';
  const pending=(typeof MP!=='undefined'&&MP.duelOut);
  if(pending&&MP.duelOut.to===r.id)
    return '<button class="lb-row-duel is-pending" data-duel-cancel="1" title="Annuler le défi" aria-label="Annuler le défi à '+escH(r.username)+'">'+
      '<span class="lb-row-duel-spin"></span></button>';
  return '<button class="lb-row-duel" data-duel="'+escH(r.id)+'" data-name="'+escH(r.username)+'" '+
    'title="Défier '+escH(r.username)+'" aria-label="Défier '+escH(r.username)+'">'+LB_SWORDS+'</button>';
}
const LB_SWORDS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
  '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/>'+
  '<path d="M9.5 17.5 21 6V3h-3L6.5 14.5"/><path d="m11 19-6-6"/><path d="m8 16-4 4"/><path d="m5 21-2-2"/></svg>';
function lbRowHTML(r,showRank,opts){
  const o=opts||{};
  const peak=Math.max(r.elo|0,r.elo_peak|0);
  const rank=(typeof vvGetRank==='function')?vvGetRank(peak):{name:'',color:'var(--muted)'};
  const me=(typeof ECP!=='undefined'&&ECP&&r.id===ECP.id);
  const online=lbOnline(r);
  const letter=escH((r.username||'?').trim().charAt(0).toUpperCase()||'?');
  const friend=!me&&isFriend(r.id);
  const sub=r._gone?'Compte supprimé'
    :r._pending?'…'
    :'<span style="color:'+rank.color+'">'+escH(rank.name)+'</span>'+
      ' · '+(r.ranked_games|0)+(r.ranked_games>1?' parties':' partie');
  return ''+
  '<div class="lb-row-wrap'+(online&&!me?' can-duel':'')+'">'+
  '<button class="lb-row'+(me?' is-me':'')+(friend?' is-friend':'')+'" data-player="'+escH(r.id)+'">'+
    (showRank?'<span class="lb-pos'+(r.rank<=3?' lb-pos-'+r.rank:'')+'">'+(r.rank||'')+'</span>':'')+
    '<span class="acc-medal lb-medal" style="--medal-c:'+rank.color+'">'+
      '<span class="acc-medal-letter">'+letter+'</span>'+
      '<span class="lb-dot'+(online?' on':'')+'" title="'+(online?'En ligne':'Hors ligne')+'"></span>'+
    '</span>'+
    '<span class="lb-id">'+
      '<span class="lb-name">'+escH(r.username)+(me?' <em>(vous)</em>':'')+
        (friend&&!o.friend?' <span class="lb-friend-tag" title="Dans vos amis">ami</span>':'')+'</span>'+
      '<span class="lb-sub">'+sub+'</span>'+
    '</span>'+
    '<span class="lb-elo">'+(r._pending||r._gone?'':(r.elo|0))+'</span>'+
  '</button>'+
  lbRowDuelHTML(r,me,online)+
  '</div>';
}

function lbListHTML(){
  if(_lbSearchRows){
    if(!_lbSearchRows.length)
      return '<p class="lb-empty">Aucun joueur ne porte ce nom.</p>';
    return '<div class="lb-list">'+_lbSearchRows.map(r=>lbRowHTML(r,false)).join('')+'</div>';
  }
  if(_lbLoading&&!_lbRows.length)return '<p class="lb-empty">Chargement du classement…</p>';
  if(!_lbRows.length)
    return '<p class="lb-empty">Personne n\'a encore joué de partie classée. '+
           'La première victoire ouvre le tableau.</p>';
  return ''+
    '<div class="lb-count">'+_lbTotal+(_lbTotal>1?' joueurs classés':' joueur classé')+'</div>'+
    '<div class="lb-list">'+_lbRows.map(r=>lbRowHTML(r,true)).join('')+'</div>'+
    (_lbRows.length<_lbTotal
      ? '<button class="btn btn-ghost lb-more" id="lb-more">Voir la suite</button>' : '');
}

// En ligne : la présence Realtime d'abord (instantanée), le serveur
// ensuite (jusqu'à 30 s de retard). Voir l'en-tête du fichier.
function lbOnline(r){
  if(typeof mpIsOnline==='function'&&mpIsOnline(r.id))return true;
  return !!r.online;
}

// ----------------------------------------------------------------
// LE PROFIL D'UN JOUEUR
// ----------------------------------------------------------------
function lbProfileHTML(p){
  const elo=p.elo|0,peak=Math.max(elo,p.elo_peak|0);
  const rank=(typeof vvGetRank==='function')?vvGetRank(peak):{name:'',color:'var(--muted)'};
  const games=p.ranked_games|0,wins=p.ranked_wins|0;
  const rate=games?Math.round(wins/games*100):null;
  const me=(typeof ECP!=='undefined'&&ECP&&p.id===ECP.id);
  const online=lbOnline(p);
  const letter=escH((p.username||'?').trim().charAt(0).toUpperCase()||'?');
  const stats=[
    {k:'Place',            v:p.rank?'#'+p.rank:'—'},
    {k:'Parties classées', v:games},
    {k:'Victoires',        v:rate===null?'—':rate+' %'},
    {k:'Meilleure série',  v:p.best_streak|0},
    {k:'Meilleur ELO',     v:peak},
  ];
  return ''+
  '<button class="btn btn-ghost lb-back" id="lb-back">← Classement</button>'+
  '<section class="acc-seal lb-seal">'+
    '<div class="acc-seal-top">'+
      '<span class="acc-medal acc-medal-lg" style="--medal-c:'+rank.color+'">'+
        '<span class="acc-medal-letter">'+letter+'</span>'+
      '</span>'+
      '<div class="acc-seal-id">'+
        '<div class="acc-name-line"><h2 class="acc-name">'+escH(p.username)+'</h2></div>'+
        '<div class="acc-rank-line">'+
          '<span class="acc-rank" style="color:'+rank.color+'">'+escH(rank.name)+'</span>'+
          '<span class="acc-dot"></span>'+
          '<span class="acc-elo">'+elo+' ELO</span>'+
          '<span class="lb-pres'+(online?' on':'')+'">'+(online?'En ligne':'Hors ligne')+'</span>'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="acc-stats">'+
      stats.map(x=>'<div class="acc-stat"><div class="acc-stat-v">'+x.v+'</div><div class="acc-stat-k">'+x.k+'</div></div>').join('')+
    '</div>'+
    lbFormHTML(p)+
    lbFavouriteHTML(p)+
    // CE QU'IL PEUT ALIGNER — l'armée choisie, les pièces débloquées, les
    // pouvoirs qui vont avec (js/replay.js). C'est la moitié de ce qu'on vient
    // chercher sur le profil de quelqu'un qu'on s'apprête à défier, et le
    // profil n'en disait pas un mot.
    ((typeof profileArsenalHTML==='function')?profileArsenalHTML(p.pub_army,p.pub_unlocked,p.pub_powers):'')+
    // SES DIX DERNIÈRES PARTIES, REJOUABLES. La bande de forme dit « il monte
    // ou il coule » ; la liste dit ce qui s'est passé, et chaque ligne ouvre
    // le mode analyse.
    ((typeof replayListHTML==='function')?replayListHTML(p.history):'')+
    lbDuelHTML(p,me,online)+
    (me?'':'<div class="lb-friend-row">'+(isFriend(p.id)
      ?'<button class="btn btn-ghost" id="lb-friend-del" data-id="'+escH(p.id)+'">Retirer de mes amis</button>'
      :'<button class="btn btn-primary" id="lb-friend-add" data-id="'+escH(p.id)+'" data-name="'+escH(p.username)+'">Ajouter en ami</button>')+'</div>')+
  '</section>';
}

// La bande de forme : les dix dernières parties classées, de la plus
// ancienne à la plus récente. Même lecture que sur son propre profil
// (voir accountFormHTML, js/account-ui.js) — une frise se lit de gauche
// à droite, comme toutes les courbes qu'on a jamais lues.
function lbFormHTML(p){
  // Même bande, mêmes pastilles cliquables que sur son propre profil.
  return (typeof replayFormHTML==='function')?replayFormHTML(p.history):'';
}

// La créature fétiche d'un autre joueur : c'est ce qu'on vient chercher
// avant de le défier. Même seuil que sur son propre profil — « 100 % de
// victoires » sur une partie ne dit rien à personne.
function lbFavouriteHTML(p){
  const st=p.piece_stats||{};
  let best=null;
  Object.keys(st).forEach(id=>{
    const e=st[id];
    if(!e||(e.g|0)<5)return;
    if(!best||e.g>best.g)best={id,g:e.g|0,w:e.w|0};
  });
  if(!best)return '';
  const piece=(typeof PIECES!=='undefined')?PIECES.find(x=>x.id===best.id):null;
  if(!piece)return '';
  const icone=(typeof pieceIcon==='function')?pieceIcon(piece.id,'n'):'';
  return ''+
  '<div class="acc-fav">'+
    '<span class="acc-fav-icon">'+icone+'</span>'+
    '<div class="acc-fav-txt">'+
      '<div class="acc-fav-name">'+escH(piece.name)+'</div>'+
      '<div class="acc-fav-sub">Créature fétiche · '+best.g+' parties, '+
        Math.round(best.w/best.g*100)+' % de victoires</div>'+
    '</div>'+
  '</div>';
}

// LE BOUTON QUI MÈNE AU JEU. Un profil qu'on ne peut que lire est une
// impasse : la seule chose qu'on ait envie de faire devant le profil de
// quelqu'un de meilleur que soi, c'est de l'affronter.
function lbDuelHTML(p,me,online){
  if(me)return '<p class="lb-note">C\'est vous. Votre fiche complète est sur la page Comptes.</p>';
  const pending=(typeof MP!=='undefined'&&MP.duelOut);
  if(pending&&MP.duelOut.to===p.id)
    return '<div class="lb-duel">'+
             '<button class="btn btn-ghost" id="lb-duel-cancel">Annuler le défi</button>'+
             '<p class="lb-note">Défi envoyé. En attente de sa réponse…</p>'+
           '</div>';
  if(!online)
    return '<p class="lb-note">'+escH(p.username)+' n\'est pas en ligne. '+
           'On ne peut défier que quelqu\'un qui est devant son écran.</p>';
  return '<div class="lb-duel">'+
           '<button class="btn btn-gold lb-duel-btn" id="lb-duel" '+
             'data-player="'+escH(p.id)+'" data-name="'+escH(p.username)+'">Défier '+escH(p.username)+'</button>'+
           (pending?'<p class="lb-note">Un autre défi est déjà en attente.</p>':'')+
         '</div>';
}

function openPlayerProfile(idOrName){
  const host=document.getElementById('lb-body');
  if(host)host.innerHTML='<p class="lb-empty">Chargement du profil…</p>';
  const args=/^[0-9a-f-]{36}$/i.test(String(idOrName))?{id:idOrName}:{username:idOrName};
  ecProfileOf(args).then(p=>{
    if(!p||!p.found){lbError('Ce joueur n\'existe plus.');return;}
    _lbProfile=p;
    if(!document.getElementById(LB_PAGE)?.classList.contains('active'))showPage(LB_PAGE);
    renderLeaderboardPage();
  }).catch(e=>lbError((e&&e.message)||'Profil indisponible.'));
}

// ----------------------------------------------------------------
// BRANCHEMENTS
// ----------------------------------------------------------------
// Le HTML est reconstruit à chaque rendu : les écouteurs se reposent
// donc ici, comme partout ailleurs dans le jeu.
function lbWire(){
  const host=document.getElementById('lb-body');
  if(!host)return;

  const input=host.querySelector('#lb-search');
  if(input){
    input.addEventListener('input',()=>{
      _lbSearch=input.value;
      // Le champ doit garder le focus d'un rendu à l'autre DÈS la première
      // lettre : l'arrivée d'un joueur dans le salon de présence redessine
      // la page, et sans cela le clavier du téléphone se refermerait au
      // milieu d'une frappe.
      _lbKeepFocus=true;
      // On attend une accalmie de frappe : une requête par lettre
      // saturerait le serveur pour des résultats que personne ne lit.
      if(_lbSearchTid)clearTimeout(_lbSearchTid);
      _lbSearchTid=setTimeout(lbRunSearch,250);
    });
    // Le champ garde le focus d'un rendu à l'autre : sans cela, le
    // clavier du téléphone se refermerait à chaque lettre.
    if(document.activeElement!==input&&_lbSearch&&_lbKeepFocus){
      input.focus();
      input.setSelectionRange(input.value.length,input.value.length);
    }
  }
  host.querySelector('#lb-search-clear')?.addEventListener('click',()=>{
    _lbSearch='';_lbSearchRows=null;_lbKeepFocus=false;renderLeaderboardPage();
  });
  host.querySelector('#lb-more')?.addEventListener('click',lbLoadMore);
  host.querySelector('#lb-back')?.addEventListener('click',()=>{
    _lbProfile=null;renderLeaderboardPage();
  });
  host.querySelectorAll('[data-player]').forEach(b=>{
    if(b.id==='lb-duel')return;
    b.addEventListener('click',()=>openPlayerProfile(b.getAttribute('data-player')));
  });
  host.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{
    _lbTab=b.getAttribute('data-tab');
    if(_lbTab==='friends')lbFriendsRefresh();
    renderLeaderboardPage();
  }));
  host.querySelectorAll('[data-duel]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    if(typeof mpChallenge==='function')mpChallenge(b.getAttribute('data-duel'),b.getAttribute('data-name'));
  }));
  host.querySelectorAll('[data-duel-cancel]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    if(typeof mpDuelCancel==='function')mpDuelCancel();
    showNotif('Défi annulé.','ok');
  }));
  host.querySelector('#lb-friend-add')?.addEventListener('click',function(){
    if(friendAdd(this.getAttribute('data-id'),this.getAttribute('data-name'))){
      if(_lbProfile)_lbFriendCache[_lbProfile.id]={at:Date.now(),row:_lbProfile};
      renderLeaderboardPage();
    }
  });
  host.querySelector('#lb-friend-del')?.addEventListener('click',function(){
    friendRemove(this.getAttribute('data-id'));renderLeaderboardPage();
  });
  // Les dix dernières parties du profil ouvert : chaque ligne mène au mode
  // analyse, et « Retour » y ramène ce profil-ci — pas le classement, qui
  // obligerait à le rouvrir pour lire la partie suivante.
  if(_lbProfile&&typeof wireReplayList==='function'){
    const prof=_lbProfile;
    wireReplayList(host,prof.history,{
      me:prof.username,meSub:(prof.elo|0)+' ELO',
      back:()=>{_lbProfile=prof;renderLeaderboardPage();showPage(LB_PAGE);},
    });
  }
  host.querySelector('#lb-duel')?.addEventListener('click',function(){
    if(typeof mpChallenge==='function')
      mpChallenge(this.getAttribute('data-player'),this.getAttribute('data-name'));
  });
  host.querySelector('#lb-duel-cancel')?.addEventListener('click',()=>{
    if(typeof mpDuelCancel==='function')mpDuelCancel();
    showNotif('Défi annulé.','ok');
  });
}

let _lbKeepFocus=false;
function lbRunSearch(){
  const q=String(_lbSearch||'').trim();
  if(!q){_lbSearchRows=null;renderLeaderboardPage();return;}
  ecSearchPlayers(q).then(rows=>{
    // Une réponse qui arrive après que le joueur a effacé son texte ne
    // doit pas ressusciter la liste précédente.
    if(String(_lbSearch||'').trim()!==q)return;
    _lbSearchRows=rows||[];
    renderLeaderboardPage();
  }).catch(e=>lbError((e&&e.message)||'Recherche indisponible.'));
}

function lbLoadMore(){
  const from=_lbRows.length;
  ecLeaderboard(LB_PAGE_SIZE,from).then(r=>{
    _lbRows=_lbRows.concat((r&&r.rows)||[]);
    _lbTotal=(r&&r.total)||_lbTotal;
    renderLeaderboardPage();
  }).catch(e=>showNotif((e&&e.message)||'Chargement impossible.','err'));
}

// Rafraîchissements passifs, appelés par js/multiplayer.js : l'arrivée
// ou le départ d'un joueur rallume les pastilles, et l'état d'un défi
// change le bas du profil ouvert. On ne redessine que si la page est à
// l'écran — reconstruire un DOM que personne ne regarde est du travail
// perdu.
function lbPaintOnline(){
  const p=document.getElementById(LB_PAGE);
  if(p&&p.classList.contains('active'))renderLeaderboardPage();
}
function lbPaintDuel(){lbPaintOnline();}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('lb-close')?.addEventListener('click',closeLeaderboardPage);
  document.getElementById('jouer-classement')?.addEventListener('click',openLeaderboardPage);
});
