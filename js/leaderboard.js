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
// main.js (escH, showPage, showNotif), cube-nav.js (goToMainMenu).
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

// ----------------------------------------------------------------
// OUVERTURE / FERMETURE
// ----------------------------------------------------------------
function openLeaderboardPage(){
  document.getElementById('settings-panel')?.classList.remove('open');
  _lbProfile=null;
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
function renderLeaderboardPage(){
  const host=document.getElementById('lb-body');
  if(!host)return;
  if(_lbProfile){host.innerHTML=lbProfileHTML(_lbProfile);lbWire();return;}
  host.innerHTML=lbSearchHTML()+lbListHTML();
  lbWire();
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
function lbRowHTML(r,showRank){
  const peak=Math.max(r.elo|0,r.elo_peak|0);
  const rank=(typeof vvGetRank==='function')?vvGetRank(peak):{name:'',color:'var(--muted)'};
  const me=(typeof ECP!=='undefined'&&ECP&&r.id===ECP.id);
  const online=lbOnline(r);
  const letter=escH((r.username||'?').trim().charAt(0).toUpperCase()||'?');
  return ''+
  '<button class="lb-row'+(me?' is-me':'')+'" data-player="'+escH(r.id)+'">'+
    (showRank?'<span class="lb-pos'+(r.rank<=3?' lb-pos-'+r.rank:'')+'">'+(r.rank||'')+'</span>':'')+
    '<span class="acc-medal lb-medal" style="--medal-c:'+rank.color+'">'+
      '<span class="acc-medal-letter">'+letter+'</span>'+
      '<span class="lb-dot'+(online?' on':'')+'" title="'+(online?'En ligne':'Hors ligne')+'"></span>'+
    '</span>'+
    '<span class="lb-id">'+
      '<span class="lb-name">'+escH(r.username)+(me?' <em>(vous)</em>':'')+'</span>'+
      '<span class="lb-sub"><span style="color:'+rank.color+'">'+escH(rank.name)+'</span>'+
        ' · '+(r.ranked_games|0)+(r.ranked_games>1?' parties':' partie')+'</span>'+
    '</span>'+
    '<span class="lb-elo">'+(r.elo|0)+'</span>'+
  '</button>';
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
    ((typeof profileArsenalHTML==='function')?profileArsenalHTML(p.pub_army,p.pub_unlocked):'')+
    // SES DIX DERNIÈRES PARTIES, REJOUABLES. La bande de forme dit « il monte
    // ou il coule » ; la liste dit ce qui s'est passé, et chaque ligne ouvre
    // le mode analyse.
    ((typeof replayListHTML==='function')?replayListHTML(p.history):'')+
    lbDuelHTML(p,me,online)+
  '</section>';
}

// La bande de forme : les dix dernières parties classées, de la plus
// ancienne à la plus récente. Même lecture que sur son propre profil
// (voir accountFormHTML, js/account-ui.js) — une frise se lit de gauche
// à droite, comme toutes les courbes qu'on a jamais lues.
function lbFormHTML(p){
  const recent=(p.history||[]).filter(h=>h&&h.ranked!==false).slice(-10);
  if(!recent.length)return '';
  const lbl={win:'Victoire',loss:'Défaite',draw:'Nulle'};
  return ''+
  '<div class="acc-form">'+
    '<div class="acc-form-k">Forme récente</div>'+
    '<div class="acc-form-dots">'+
      recent.map(h=>{
        const cls=h.result==='win'?'w':h.result==='loss'?'l':'d';
        const d=(h.delta>0?'+':'')+(h.delta||0);
        return '<span class="acc-dot-'+cls+'" title="'+escH((lbl[h.result]||'')+' · '+d+' ELO')+'"></span>';
      }).join('')+
    '</div>'+
  '</div>';
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
