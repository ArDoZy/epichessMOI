// ================================================================
// CLANS.JS : LA GUERRE DES CLANS (#page-reserve)
// ================================================================
// L'onglet « Guerre des clans » était le quatrième des cinq de la barre
// principale, et il ouvrait sur un titre et un fond noir : la page avait
// été vidée de son ancien inventaire et rien ne l'avait remplacée. C'est
// maintenant le seul endroit du jeu où l'on joue POUR QUELQU'UN.
//
// -- LA RÈGLE, VUE DU JOUEUR ------------------------------------------
//   · On fonde un clan (trois parties classées suffisent) ou on en rejoint
//     un — ouvert, sur demande, ou fermé, avec un ELO minimum.
//   · Chaque PARTIE CLASSÉE rapporte des POINTS DE GUERRE au clan :
//     victoire 10 (plus contre plus fort, moins contre bien plus faible),
//     nulle 4, défaite 1 — une fois et demie plus contre un humain. Un
//     plafond quotidien par membre (120) empêche un seul joueur de porter
//     la semaine.
//   · La GUERRE dure une semaine (lundi 00:00 UTC → lundi suivant). Le
//     front classe les clans sur leurs points de la semaine.
//   · La semaine finie, chaque membre qui a combattu RÉCLAME son BUTIN :
//     un coffre selon la place finale du clan (1er Tour, 2e–3e Fou,
//     4e–10e Cavalier, sinon Pion).
//   · Les points cumulés font monter le NIVEAU du clan (Bois → Or
//     Légendaire), qui change le métal du blason.
//
// -- CE QUE CE FICHIER NE DÉCIDE PAS ----------------------------------
// Rien de la règle ne se calcule ici. Le serveur compte les points, classe
// les clans, garde le butin (supabase/schema.sql, section « LA GUERRE DES
// CLANS ») ; ce fichier AFFICHE ce qu'il renvoie. Les seuls catalogues qui
// vivent ici — devises et cris de guerre — voyagent par leur NUMÉRO, et le
// serveur borne ces numéros : un client bricolé ne peut rien écrire chez
// les autres qui ne soit pas déjà dans le jeu (même modération par
// construction que le chat de partie, MP_CHAT dans js/multiplayer.js).
//
// -- LE RENDU -----------------------------------------------------------
// Une seule fonction peint la page (clanPaint) à partir d'un seul état
// (_clan) ; tout geste appelle le serveur, adopte sa réponse, et repeint.
// La page se peint d'abord depuis ce qu'elle sait (rien ne clignote à
// l'arrivée), puis se rafraîchit si ce qu'elle sait a plus de quinze
// secondes.
//
// Dépendances : server.js (ecClan*, ecWeekKey), blason.js (blazonSVG,
// CLAN_LEVELS), main.js (escH, showNotif, showConfirmModal), economy-ui.js
// (chestVisual, chestOpenNow), data-pieces.js (chestById).
// Facultatives (typeof) : leaderboard.js (openPlayerProfile),
// multiplayer.js (mpChallenge, mpIsOnline), replay.js (replayOppName).
// ================================================================

// Miroir des constantes du serveur (ec_clan_max_members & co.) : elles ne
// servent ici qu'à AFFICHER, jamais à décider.
const CLAN_RULES={maxMembers:30,dayCap:120,claimMin:10,foundGames:3};

// LES DEVISES (16, numérotées 0–15 côté serveur). On AJOUTE en fin de
// liste, on ne réordonne jamais : un clan garde sa devise par son numéro.
const CLAN_MOTTOS=[
  'Pour la couronne et pour le clan',
  'Que l\'échiquier tremble',
  'Pas un pion ne recule',
  'La forge ne s\'éteint jamais',
  'Notre ombre précède nos pas',
  'Qui nous défie nous honore',
  'Ni roi ni maître, sauf le nôtre',
  'Lentement, mais jusqu\'au mat',
  'L\'or se mérite',
  'Unis comme les cases du damier',
  'Le dernier coup est le nôtre',
  'Par le feu et par le vif-argent',
  'Nous ne tombons qu\'ensemble',
  'La nuit est notre alliée',
  'Du bois jusqu\'à l\'or',
  'Chaque pièce compte',
];

// LES CRIS DE GUERRE (24, numérotés 0–23 côté serveur). Même ligne que les
// phrases du chat de partie : on parle de la guerre et des pièces, jamais
// de quelqu'un.
const CLAN_CRIES=[
  'Pour le clan !',
  'Tenez la ligne !',
  'Qui m\'accompagne au front ?',
  'Encore une victoire et nous passons devant.',
  'La semaine n\'est pas finie.',
  'Bien joué, compagnon d\'armes.',
  'Gloire à nos créatures !',
  'Je prends la relève.',
  'Formez les rangs, la guerre commence.',
  'Un dernier assaut avant lundi.',
  'Nos blasons ne plieront pas.',
  'Merci pour les points !',
  'Je reviens du front, victorieux.',
  'Je suis tombé. Vengez-moi.',
  'Bienvenue parmi nous.',
  'Au rapport, chef !',
  'Le butin sera pour tous.',
  'Ils nous talonnent : on ne lâche rien.',
  'La première place est en vue !',
  'Repos mérité, à demain.',
  'Les dés sont jetés.',
  'Que chaque coup compte.',
  'À l\'assaut !',
  'Le front tient. Bravo à tous.',
];

const CLAN_RECRUIT={open:'Ouvert',request:'Sur demande',closed:'Fermé'};
const CLAN_ROLE={chef:'Chef',officier:'Officier',membre:'Membre'};

// L'état de la page. `mine` est la réponse d'ec_clan_mine (clan, membres,
// journal, demandes, butin) ; `war` celle d'ec_clan_war ; `list` celle
// d'ec_clan_list, qui ne sert que sans clan.
let _clan={mine:null,war:null,list:null,q:'',tab:'front',at:0,loading:false,err:null,busy:false};
let _clanSearchTid=null;

// ----------------------------------------------------------------
// L'ENTRÉE : appelée à chaque arrivée sur la page (pages-nav.js)
// ----------------------------------------------------------------
function renderReservePage(){
  if(!CUR_ACC)return;
  // UNE ARRIVÉE, UNE SEULE ENTRÉE. pages-nav.js appelle cette fonction deux
  // fois par visite : au départ du glissement, page encore hors du cadre, et
  // à l'arrivée, page devenue `is-front`. Seul le premier appel est une
  // arrivée : c'est lui qui rejoue l'entrée des cartes. Le second retombe
  // sur un rendu identique et ne touche à rien (voir clanPaint).
  const pg=clanHost()&&clanHost().closest('.nav-page');
  if(pg&&!pg.classList.contains('is-front'))_clanEnter=true;
  clanPaint();
  if(Date.now()-_clan.at>15000&&!_clan.loading)clanRefresh();
}

function clanRefresh(){
  if(typeof ecClanMine!=='function')return Promise.resolve();
  _clan.loading=true;_clan.err=null;
  if(!_clan.mine)clanPaint();
  return Promise.all([
    ecClanMine(),
    ecClanWar().catch(()=>null),
  ]).then(([mine,war])=>{
    _clan.mine=mine;_clan.war=war;_clan.at=Date.now();
    if(!mine.clan)return ecClanList(_clan.q).then(l=>{_clan.list=l;}).catch(()=>{_clan.list=[];});
  }).catch(e=>{
    // LE SERVEUR N'A PAS ENCORE LES CLANS : PostgREST répond 404 « Could not
    // find the function ». C'est une installation à faire (migration 001),
    // pas une panne — on le dit tel quel plutôt qu'un « injoignable » qui
    // ferait chercher du côté du réseau.
    const missing=e&&(e.status===404||e.code==='PGRST202'||/Could not find the function/i.test(e.message||''));
    _clan.err=missing?'La Guerre des clans n\'est pas encore ouverte sur ce serveur. Elle le sera dès l\'installation de sa mise à jour (supabase/schema.sql, à recoller dans Supabase).'
      :((e&&e.message)||'La guerre des clans est injoignable.');
  }).then(()=>{
    _clan.loading=false;
    clanPaint();
    if(typeof clanPaintRail==='function')clanPaintRail();
  });
}

// Un geste : appel au serveur, adoption, nouveau rendu. Un refus du
// serveur est une PHRASE écrite pour le joueur (« Ce sigle est déjà
// porté… ») : elle s'affiche telle quelle.
function clanAct(promise,okMsg,after){
  if(_clan.busy)return Promise.resolve(null);
  _clan.busy=true;clanPaintBusy();
  return promise.then(r=>{
    if(r&&('clan' in r))_clan.mine=r;
    _clan.at=Date.now();
    if(okMsg)showNotif(okMsg,'ok');
    if(after)after(r);
    return r;
  }).catch(e=>{
    showNotif((e&&e.message)||'Le serveur a refusé.','err');
    if(typeof playSound==='function')playSound('deny');
    return null;
  }).then(r=>{
    _clan.busy=false;
    clanRefreshSoon();
    clanPaintRail();
    return r;
  });
}
// Après un geste, le front et la liste ont pu changer : on les relit sans
// bloquer l'affichage de ce que le geste a déjà rendu.
function clanRefreshSoon(){_clan.at=0;clanRefresh();}
function clanPaintBusy(){
  const r=document.getElementById('clan-root');
  if(r)r.classList.toggle('is-busy',!!_clan.busy);
}

// ----------------------------------------------------------------
// LE RENDU
// ----------------------------------------------------------------
function clanHost(){return document.getElementById('clan-root');}

// LE RENDU EST IDEMPOTENT, ET L'ENTRÉE NE SE JOUE QU'UNE FOIS. Réécrire la
// page à chaque appel recréait toutes les cartes, et chaque carte recréée
// rejouait son entrée (clanRowIn, clanBlzIn…) : la page sursautait deux
// fois par visite, puis une troisième quand le serveur répondait. Désormais :
//   - un rendu identique au précédent ne touche pas au document ;
//   - un rendu qui change de nature (squelette → clan, clan → recrutement)
//     ou une arrivée sur la page jouent l'entrée ;
//   - tout autre rendu (le serveur a répondu, un geste a abouti) remplace
//     le contenu sans rien rejouer : `is-settled` coupe les entrées
//     (css/style.css). Un changement d'onglet ne fait entrer que le panneau.
let _clanEnter=false,_clanPainted='',_clanKind='',_clanTabShown='';
function clanPaint(){
  const host=clanHost();if(!host)return;
  const m=_clan.mine;
  let html,kind;
  if(!m&&_clan.err){html=clanErrorHTML(_clan.err);kind='err';}
  else if(!m){html=clanSkeletonHTML();kind='skel';}
  else if(m.clan){html=clanMineHTML(m);kind='mine';}
  else{html=clanLobbyHTML(m);kind='lobby';}
  host.classList.toggle('is-busy',!!_clan.busy);
  const enter=_clanEnter||kind!==_clanKind;
  _clanEnter=false;
  // Chaque blason porte des identifiants neufs (blz12c, blz12g… voir
  // blazonSVG, js/blason.js) : deux rendus du même clan ne diffèrent que
  // par eux. On les ignore pour comparer.
  const sig=html.replace(/blz\d+/g,'blz');
  if(sig===_clanPainted&&host.firstChild){
    // Même contenu, mais une arrivée : on rejoue l'entrée sur les cartes en
    // place. Couper puis rendre les animations les fait repartir de zéro.
    if(enter){
      host.classList.add('is-settled');
      void host.offsetWidth;
      host.classList.remove('is-settled','is-tabbing');
    }
    return;
  }
  host.classList.toggle('is-settled',!enter);
  host.classList.toggle('is-tabbing',!enter&&_clan.tab!==_clanTabShown);
  host.innerHTML=html;
  _clanPainted=sig;_clanKind=kind;_clanTabShown=_clan.tab;
  clanWire(host);
  clanTickCountdowns();
}

function clanErrorHTML(msg){
  return '<div class="clan-empty"><p>'+escH(msg)+'</p>'+
    '<button class="btn btn-ghost" data-clan="retry">Réessayer</button></div>';
}
function clanSkeletonHTML(){
  return '<div class="clan-skel"><div class="clan-skel-hero"></div><div class="clan-skel-row"></div>'+
    '<div class="clan-skel-row"></div><div class="clan-skel-row"></div></div>';
}

// Le temps qui reste avant lundi 00:00 UTC, dit comme on le dit.
function clanCountdown(endsAt){
  const ms=Math.max(0,(endsAt||ecWeekEnd())-Date.now());
  const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5),mn=Math.floor(ms%36e5/6e4);
  if(d>0)return d+' j '+h+' h';
  if(h>0)return h+' h '+String(mn).padStart(2,'0');
  return mn+' min';
}
function clanCountdownHTML(endsAt){
  return '<span class="clan-countdown" data-end="'+(endsAt||ecWeekEnd())+'">'+clanCountdown(endsAt)+'</span>';
}
let _clanTick=null;
function clanTickCountdowns(){
  if(_clanTick)return;
  _clanTick=setInterval(()=>{
    document.querySelectorAll('.clan-countdown[data-end]').forEach(el=>{
      el.textContent=clanCountdown(+el.dataset.end);
    });
  },20000);
}

// « 3e », « 1er » : la place d'un clan se lit comme une place de course.
function clanOrdinal(n){return n===1?'1er':n+'e';}
function clanLevelName(l){return (CLAN_LEVELS[l]||CLAN_LEVELS[0]).name;}
function clanTagHTML(tag){return '<span class="clan-tag">'+escH(tag)+'</span>';}
function clanNum(n){return (n|0).toLocaleString('fr-FR');}

// Le temps écoulé depuis un évènement du journal.
function clanAgo(t){
  const s=Math.max(0,(Date.now()-t)/1000);
  if(s<60)return 'à l\'instant';
  if(s<3600)return 'il y a '+Math.floor(s/60)+' min';
  if(s<86400)return 'il y a '+Math.floor(s/3600)+' h';
  const d=Math.floor(s/86400);
  return 'il y a '+d+' j';
}

// -- SANS CLAN : LE RECRUTEMENT --------------------------------------
function clanLobbyHTML(m){
  const games=(typeof ECP!=='undefined'&&ECP)?(ECP.ranked_games|0):0;
  const admin=(typeof ECP!=='undefined'&&ECP&&ECP.is_admin)||(typeof vvAdmin==='function'&&vvAdmin());
  const canFound=admin||games>=CLAN_RULES.foundGames;
  const war=_clan.war;
  const sent=new Set(m.requests_sent||[]);
  let h='';
  h+='<section class="clan-intro">'+
    '<div class="clan-intro-banner" aria-hidden="true">'+
      '<span class="clan-intro-flag f1">'+blazonSVG({s:4,d:1,c1:2,c2:5,ch:1,cc:0},{level:3})+'</span>'+
      '<span class="clan-intro-flag f2">'+blazonSVG({s:0,d:4,c1:3,c2:0,ch:0,cc:1},{level:5})+'</span>'+
      '<span class="clan-intro-flag f3">'+blazonSVG({s:4,d:3,c1:4,c2:7,ch:6,cc:0},{level:2})+'</span>'+
    '</div>'+
    '<h2 class="clan-intro-title">Rejoignez la guerre</h2>'+
    '<ol class="clan-rules">'+
      '<li><b>Chaque partie classée</b> rapporte des points de guerre à votre clan — une fois et demie plus contre un humain.</li>'+
      '<li><b>Chaque semaine</b>, les clans sont classés. La guerre s\'achève dans '+clanCountdownHTML(m.week&&m.week.ends_at)+'.</li>'+
      '<li><b>Le lundi</b>, chaque combattant réclame son butin : un coffre selon la place de son clan.</li>'+
    '</ol>'+
    '<div class="clan-cta">'+
      '<button class="btn btn-gold clan-found" data-clan="found"'+(canFound?'':' aria-disabled="true"')+'>Fonder un clan</button>'+
      (canFound?'':'<span class="clan-cta-note">'+CLAN_RULES.foundGames+' parties classées requises (vous : '+games+')</span>')+
    '</div>'+
  '</section>';
  h+=clanClaimHTML(m.claim);
  h+='<section class="clan-sec">'+
    '<div class="rs-sec-title">Clans qui recrutent</div>'+
    '<div class="lb-search clan-search">'+
      '<svg class="lb-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>'+
      '<input class="acc-input lb-search-input" id="clan-q" type="search" placeholder="Chercher un clan ou un sigle" autocomplete="off" spellcheck="false" value="'+escH(_clan.q)+'" aria-label="Chercher un clan">'+
    '</div>';
  const list=_clan.list;
  if(!list)h+='<p class="lb-empty">Chargement des clans…</p>';
  else if(!list.length)h+='<p class="lb-empty">'+(_clan.q?'Aucun clan ne porte ce nom.':'Aucun clan ne recrute pour l\'instant. Fondez le premier.')+'</p>';
  else h+='<div class="clan-list">'+list.map(c=>clanCardHTML(c,sent.has(c.id))).join('')+'</div>';
  h+='</section>';
  if(war&&war.rows&&war.rows.length)h+=clanFrontHTML(war,null,true);
  return h;
}

// Une carte de clan, dans la liste du recrutement.
function clanCardHTML(c,pending){
  const full=(c.members|0)>=CLAN_RULES.maxMembers;
  const peak=(typeof vvLoadPeakElo==='function')?vvLoadPeakElo():0;
  const tooLow=(c.min_elo|0)>peak;
  let btn;
  if(pending)btn='<span class="clan-card-state">Demande envoyée</span>';
  else if(c.recruit==='closed')btn='<span class="clan-card-state">Fermé</span>';
  else if(full)btn='<span class="clan-card-state">Complet</span>';
  else if(tooLow)btn='<span class="clan-card-state">'+c.min_elo+' ELO requis</span>';
  else btn='<button class="btn btn-primary clan-join" data-clan="join" data-id="'+escH(c.id)+'">'+(c.recruit==='request'?'Demander':'Rejoindre')+'</button>';
  return '<div class="clan-card" style="--clan-c:'+clanColor(c.blazon)+'">'+
    '<button class="clan-card-main" data-clan="view" data-id="'+escH(c.id)+'">'+
      '<span class="clan-card-blz">'+blazonSVG(c.blazon,{level:c.level})+'</span>'+
      '<span class="clan-card-id">'+
        '<span class="clan-card-name">'+escH(c.name)+' '+clanTagHTML(c.tag)+'</span>'+
        '<span class="clan-card-motto">'+escH(CLAN_MOTTOS[c.motto]||'')+'</span>'+
        '<span class="clan-card-meta">'+
          '<span>'+clanLevelName(c.level)+'</span>'+
          '<span>'+(c.members|0)+' / '+CLAN_RULES.maxMembers+'</span>'+
          (c.online?'<span class="clan-on">'+c.online+' en ligne</span>':'')+
          '<span>'+clanNum(c.week_points)+' pts</span>'+
          (c.min_elo?'<span>'+c.min_elo+' ELO min.</span>':'')+
        '</span>'+
      '</span>'+
    '</button>'+
    '<span class="clan-card-act">'+btn+'</span>'+
  '</div>';
}

// La couleur dominante d'un blason : elle teinte la carte, la bannière et
// le liseré du clan partout où il paraît.
function clanColor(b){
  const t=(typeof BLAZON_TINCTURES!=='undefined')?BLAZON_TINCTURES:[];
  const x=blazonClean(b||{});
  return (t[x.c1]&&t[x.c1].c)||'var(--gold)';
}
function clanColor2(b){
  const t=(typeof BLAZON_TINCTURES!=='undefined')?BLAZON_TINCTURES:[];
  const x=blazonClean(b||{});
  return (t[x.c2]&&t[x.c2].c)||'var(--gold2)';
}

// -- LE BUTIN ----------------------------------------------------------
function clanClaimHTML(claim){
  if(!claim||!claim.available)return '';
  const chest=(typeof chestById==='function')?chestById(claim.chest):{name:'Coffre',color:'#d0a950'};
  const vis=(typeof chestVisual==='function')?chestVisual(chest,'chest-lg chest-ready'):'';
  const where=claim.rank?('Votre clan '+(claim.clan?clanTagHTML(claim.clan.tag)+' ':'')+'a fini '+clanOrdinal(claim.rank)+' la semaine passée.')
    :'Votre clan a combattu la semaine passée.';
  return '<section class="clan-loot">'+
    '<div class="clan-loot-rays" aria-hidden="true"></div>'+
    '<div class="clan-loot-chest">'+vis+'</div>'+
    '<div class="clan-loot-txt">'+
      '<div class="clan-loot-kicker">Butin de guerre</div>'+
      '<div class="clan-loot-name">'+escH(chest.name)+'</div>'+
      '<div class="clan-loot-why">'+where+' Vous lui avez rapporté '+clanNum(claim.points)+' points.</div>'+
      '<button class="btn btn-gold" data-clan="claim">Réclamer le butin</button>'+
    '</div>'+
  '</section>';
}

// -- AVEC UN CLAN ------------------------------------------------------
function clanMineHTML(m){
  const c=m.clan,me=m.me||{};
  const L=CLAN_LEVELS[c.level]||CLAN_LEVELS[0],N=CLAN_LEVELS[c.level+1];
  const lvlPct=N?Math.min(100,Math.round(((c.points_total|0)-L.at)/(N.at-L.at)*100)):100;
  const war=_clan.war;
  const nClans=(war&&war.rows)?war.rows.length:0;
  const dayPct=Math.min(100,Math.round((me.day_points|0)/(me.day_cap||CLAN_RULES.dayCap)*100));
  const reqs=(m.requests||[]).length;
  let h='';
  // LA BANNIÈRE : l'étoffe aux deux émaux du blason, qui ondule derrière
  // lui. C'est la seule chose du jeu qui porte les couleurs d'un joueur.
  h+='<section class="clan-hero" style="--clan-c:'+clanColor(c.blazon)+';--clan-c2:'+clanColor2(c.blazon)+';--lvl-c:'+L.metal+';--lvl-hi:'+L.hi+'">'+
    '<div class="clan-hero-blz"><div class="clan-hero-cloth" aria-hidden="true"><span></span></div>'+
      blazonSVG(c.blazon,{level:c.level,cls:'blz-hero'})+'<span class="clan-hero-sheen"></span></div>'+
    '<div class="clan-hero-id">'+
      '<h2 class="clan-hero-name">'+escH(c.name)+'</h2>'+
      '<div class="clan-hero-line">'+clanTagHTML(c.tag)+'<span class="clan-role-chip role-'+escH(me.role||'membre')+'">'+escH(CLAN_ROLE[me.role]||'Membre')+'</span></div>'+
      '<div class="clan-hero-motto">« '+escH(CLAN_MOTTOS[c.motto]||'')+' »</div>'+
      '<div class="clan-lvl">'+
        '<div class="clan-lvl-row"><span class="clan-lvl-name">'+escH(L.name)+'</span>'+
          '<span class="clan-lvl-pts">'+clanNum(c.points_total)+(N?' / '+clanNum(N.at):'')+'</span></div>'+
        '<div class="clan-bar clan-bar-lvl"><span style="width:'+lvlPct+'%"></span></div>'+
      '</div>'+
    '</div>'+
    '<div class="clan-hero-stats">'+
      '<div class="clan-stat"><b>'+(c.members|0)+'<small>/'+CLAN_RULES.maxMembers+'</small></b><span>Membres</span></div>'+
      '<div class="clan-stat"><b class="'+(c.online?'is-on':'')+'">'+(c.online|0)+'</b><span>En ligne</span></div>'+
      '<div class="clan-stat"><b>'+(c.week_rank?clanOrdinal(c.week_rank):'—')+'</b><span>Au front</span></div>'+
    '</div>'+
  '</section>';

  // LA GUERRE DE LA SEMAINE, en un coup d'œil.
  h+='<section class="clan-war">'+
    '<div class="clan-war-top">'+
      '<div class="clan-war-big"><span class="clan-war-n">'+clanNum(c.week_points)+'</span><span class="clan-war-u">points de guerre</span></div>'+
      '<div class="clan-war-side">'+
        '<div class="clan-war-rank">'+(c.week_rank?clanOrdinal(c.week_rank)+(nClans?' sur '+nClans:''):'Pas encore classé')+'</div>'+
        '<div class="clan-war-end">Fin dans '+clanCountdownHTML(m.week&&m.week.ends_at)+'</div>'+
      '</div>'+
    '</div>'+
    '<div class="clan-war-me">'+
      '<div class="clan-war-me-row"><span>Votre part cette semaine</span><b>'+clanNum(me.week_points)+' pts</b></div>'+
      '<div class="clan-war-me-row"><span>Aujourd\'hui</span><b>'+(me.day_points|0)+' / '+(me.day_cap||CLAN_RULES.dayCap)+'</b></div>'+
      '<div class="clan-bar clan-bar-day'+(dayPct>=100?' is-full':'')+'"><span style="width:'+dayPct+'%"></span></div>'+
      '<p class="clan-war-hint">'+(dayPct>=100
        ?'Plafond du jour atteint : vos parties comptent toujours pour l\'ELO, plus pour la guerre avant demain.'
        :'Victoire 10 pts (+ exploit contre plus fort), nulle 4, défaite 1. ×1,5 contre un humain.')+'</p>'+
    '</div>'+
  '</section>';

  h+=clanClaimHTML(m.claim);

  // LES TROIS ONGLETS
  const tab=_clan.tab;
  h+='<div class="clan-tabs" role="tablist">'+
    clanTabBtn('front','Front',tab)+
    clanTabBtn('membres','Membres',tab,reqs)+
    clanTabBtn('journal','Journal',tab)+
  '</div>';
  h+='<div class="clan-panel">';
  if(tab==='membres')h+=clanMembersHTML(m);
  else if(tab==='journal')h+=clanJournalHTML(m);
  else h+=war?clanFrontHTML(war,c.id,false):'<p class="lb-empty">Chargement du front…</p>';
  h+='</div>';

  h+='<div class="clan-foot">'+
    (me.role==='chef'?'<button class="btn btn-ghost" data-clan="edit">Modifier le blason</button>':'')+
    '<button class="btn btn-ghost clan-leave" data-clan="leave">Quitter le clan</button>'+
  '</div>';
  return h;
}

function clanTabBtn(id,label,cur,badge){
  return '<button class="clan-tab'+(cur===id?' on':'')+'" data-clan="tab" data-tab="'+id+'" role="tab" aria-selected="'+(cur===id)+'">'+
    label+(badge?'<span class="clan-tab-badge">'+badge+'</span>':'')+'</button>';
}

// -- LE FRONT ------------------------------------------------------------
// Le classement des clans de la semaine, et le podium de la précédente.
function clanFrontHTML(war,mineId,withTitle){
  const rows=war.rows||[];
  const top=rows.length?Math.max(1,rows[0].points|0):1;
  let h='<section class="clan-sec">';
  if(withTitle)h+='<div class="rs-sec-title">Le front de la semaine</div>';
  // Le front vide n'est plus une phrase seule au milieu de la page : une
  // carte, qui dit ce qui l'ouvre et y mène d'un geste.
  if(!rows.length)h+='<div class="clan-front-empty">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
        '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/>'+
        '<path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4"/><path d="m7 17-3 3"/><path d="m3 19 2 2"/></svg>'+
      '<b>Le front est calme</b>'+
      '<p>Aucun clan n\'a encore marqué de point cette semaine. Une victoire classée suffit à l\'ouvrir.</p>'+
      '<button class="btn btn-gold" data-clan="fight">Au combat</button></div>';
  else h+='<div class="clan-front">'+rows.map(r=>{
    const pct=Math.max(3,Math.round((r.points|0)/top*100));
    return '<button class="clan-front-row'+(r.id===mineId?' is-mine':'')+(r.rank<=3?' top'+r.rank:'')+'" data-clan="view" data-id="'+escH(r.id)+'" style="--clan-c:'+clanColor(r.blazon)+'">'+
      '<span class="clan-front-pos">'+r.rank+'</span>'+
      '<span class="clan-front-blz">'+blazonSVG(r.blazon,{level:r.level,plain:true})+'</span>'+
      '<span class="clan-front-id"><span class="clan-front-name">'+escH(r.name)+' '+clanTagHTML(r.tag)+'</span>'+
        '<span class="clan-bar clan-bar-front"><span style="width:'+pct+'%"></span></span></span>'+
      '<span class="clan-front-pts"><b>'+clanNum(r.points)+'</b><small>'+(r.wins|0)+' V · '+(r.games|0)+' p.</small></span>'+
    '</button>';
  }).join('')+'</div>';
  const pod=war.podium||[];
  if(pod.length){
    // Le podium se dessine 2 · 1 · 3, comme tous les podiums du monde.
    const order=[pod[1],pod[0],pod[2]].filter(Boolean);
    h+='<div class="rs-sec-title clan-pod-title">Podium de la semaine passée</div>'+
      '<div class="clan-podium">'+order.map(r=>
        '<button class="clan-pod p'+r.rank+'" data-clan="view" data-id="'+escH(r.id)+'">'+
          '<span class="clan-pod-blz">'+blazonSVG(r.blazon,{level:r.level})+'</span>'+
          '<span class="clan-pod-name">'+clanTagHTML(r.tag)+'</span>'+
          '<span class="clan-pod-step"><b>'+clanOrdinal(r.rank)+'</b><small>'+clanNum(r.points)+' pts</small></span>'+
        '</button>').join('')+'</div>';
  }
  return h+'</section>';
}

// -- LES MEMBRES -----------------------------------------------------------
function clanMembersHTML(m){
  const me=m.me||{};
  const myId=(typeof ECP!=='undefined'&&ECP)?ECP.id:null;
  const members=m.members||[];
  const top=Math.max(1,...members.map(x=>x.week_points|0));
  let h='';
  const reqs=m.requests||[];
  if(reqs.length){
    h+='<div class="rs-sec-title">Demandes d\'adhésion</div><div class="clan-reqs">'+reqs.map(r=>
      '<div class="clan-req"><span class="clan-req-name">'+escH(r.username)+'</span>'+
        '<span class="clan-req-elo">'+(Math.max(r.elo|0,r.elo_peak|0))+' ELO</span>'+
        '<button class="btn btn-primary" data-clan="accept" data-id="'+escH(r.id)+'">Accepter</button>'+
        '<button class="btn btn-ghost" data-clan="refuse" data-id="'+escH(r.id)+'">Refuser</button></div>').join('')+'</div>';
  }
  h+='<div class="clan-members">'+members.map(x=>{
    const online=x.online||(typeof mpIsOnline==='function'&&mpIsOnline(x.id));
    const pct=Math.round((x.week_points|0)/top*100);
    const rank=(typeof vvGetRank==='function')?vvGetRank(Math.max(x.elo|0,x.elo_peak|0)):{color:'var(--muted)'};
    return '<button class="clan-mem'+(x.id===myId?' is-me':'')+'" data-clan="member" data-id="'+escH(x.id)+'">'+
      '<span class="acc-medal clan-mem-medal" style="--medal-c:'+rank.color+'"><span class="acc-medal-letter">'+
        escH((x.username||'?').trim().charAt(0).toUpperCase())+'</span><span class="lb-dot'+(online?' on':'')+'"></span></span>'+
      '<span class="clan-mem-id"><span class="clan-mem-name">'+escH(x.username||'?')+(x.id===myId?' <em>(vous)</em>':'')+'</span>'+
        '<span class="clan-mem-sub"><span class="clan-role-chip role-'+escH(x.role)+'">'+escH(CLAN_ROLE[x.role]||'')+'</span>'+(x.elo|0)+' ELO</span>'+
        '<span class="clan-bar clan-bar-mem"><span style="width:'+pct+'%"></span></span></span>'+
      '<span class="clan-mem-pts"><b>'+clanNum(x.week_points)+'</b><small>'+clanNum(x.points_total)+' au total</small></span>'+
    '</button>';
  }).join('')+'</div>';
  if(me.role==='chef'||me.role==='officier')
    h+='<p class="clan-note">Touchez un membre pour '+(me.role==='chef'?'changer son rang ou l\'exclure':'l\'exclure (membres seulement)')+'.</p>';
  return h;
}

// -- LE JOURNAL ------------------------------------------------------------
const CLAN_EVENT_ICON={
  found:'M12 2 15 9H22L16.5 13.5 18.5 21 12 16.5 5.5 21 7.5 13.5 2 9H9Z',
  join:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c0-4 3-6 7-6s7 2 7 6Z',
  leave:'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  kick:'M6 6 18 18M18 6 6 18',
  role:'M4 17 7 7l5 5 5-5 3 10Z',
  win:'M7 4h10v4a5 5 0 0 1-10 0ZM5 4H3v2a4 4 0 0 0 4 4M19 4h2v2a4 4 0 0 1-4 4M12 13v4M8 21h8',
  draw:'M5 9h14M5 15h14',
  level:'M12 3 20 8v8l-8 5-8-5V8Z',
  cry:'M3 10v4h4l6 5V5L7 10Zm14-2a5 5 0 0 1 0 8',
  edit:'M4 20h4L19 9l-4-4L4 16Z',
};
function clanEventText(e){
  const d=e.data||{},who='<b>'+escH(d.who||'Quelqu\'un')+'</b>';
  const opp=d.opp?((typeof replayOppName==='function')?replayOppName({opp:d.opp}):d.opp):'';
  switch(e.kind){
    case 'found':return who+' fonde le clan.';
    case 'join':return who+' rejoint le clan'+(d.by?' (accueilli par '+escH(d.by)+')':'')+'.';
    case 'leave':return who+' quitte le clan.';
    case 'kick':return who+' est exclu'+(d.by?' par '+escH(d.by):'')+'.';
    case 'role':return who+' devient <b>'+escH((CLAN_ROLE[d.role]||'').toLowerCase())+'</b>'+(d.by?' (par '+escH(d.by)+')':'')+'.';
    case 'win':return who+' l\'emporte'+(opp?' face à '+escH(opp):'')+' <span class="clan-ev-pts">+'+(d.pts|0)+'</span>';
    case 'draw':return who+' tient la nulle'+(opp?' face à '+escH(opp):'')+' <span class="clan-ev-pts">+'+(d.pts|0)+'</span>';
    case 'level':return 'Le clan passe au niveau <b>'+escH(clanLevelName(d.level|0))+'</b> !';
    case 'cry':return who+' : <span class="clan-ev-cry">« '+escH(CLAN_CRIES[d.cry|0]||'…')+' »</span>';
    case 'edit':return who+' redessine le blason.';
  }
  return who;
}
function clanJournalHTML(m){
  const ev=m.events||[];
  let h='<button class="btn btn-gold clan-cry-btn" data-clan="cry">Pousser un cri de guerre</button>';
  if(!ev.length)return h+'<p class="lb-empty">Le journal est vide. La première victoire l\'ouvrira.</p>';
  return h+'<ol class="clan-journal">'+ev.map(e=>
    '<li class="clan-ev ev-'+escH(e.kind)+'">'+
      '<span class="clan-ev-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(CLAN_EVENT_ICON[e.kind]||CLAN_EVENT_ICON.cry)+'"/></svg></span>'+
      '<span class="clan-ev-txt">'+clanEventText(e)+'</span>'+
      '<span class="clan-ev-at">'+clanAgo(e.at)+'</span>'+
    '</li>').join('')+'</ol>';
}

// ----------------------------------------------------------------
// LES BRANCHEMENTS
// ----------------------------------------------------------------
function clanWire(host){
  host.querySelectorAll('[data-clan]').forEach(el=>{
    const act=el.getAttribute('data-clan');
    if(act==='member'||act==='view'||el.tagName==='BUTTON')el.addEventListener('click',ev=>clanOnAction(act,el,ev));
  });
  const q=host.querySelector('#clan-q');
  if(q){
    q.addEventListener('input',()=>{
      _clan.q=q.value;
      if(_clanSearchTid)clearTimeout(_clanSearchTid);
      _clanSearchTid=setTimeout(()=>{
        ecClanList(_clan.q).then(l=>{_clan.list=l;clanPaintList();}).catch(()=>{});
      },260);
    });
  }
}
// La liste se repeint SEULE pendant une recherche : repeindre la page
// détruirait le champ au milieu d'une frappe (le piège documenté dans
// js/leaderboard.js, renderLeaderboardPage).
function clanPaintList(){
  const host=clanHost();if(!host)return;
  const sec=host.querySelector('.clan-search');if(!sec)return;
  let after=sec.nextElementSibling;
  while(after&&!after.matches('.clan-list,.lb-empty'))after=after.nextElementSibling;
  const sent=new Set((_clan.mine&&_clan.mine.requests_sent)||[]);
  const list=_clan.list||[];
  const html=list.length?'<div class="clan-list">'+list.map(c=>clanCardHTML(c,sent.has(c.id))).join('')+'</div>'
    :'<p class="lb-empty">'+(_clan.q?'Aucun clan ne porte ce nom.':'Aucun clan ne recrute pour l\'instant. Fondez le premier.')+'</p>';
  const tmp=document.createElement('div');tmp.innerHTML=html;
  const node=tmp.firstElementChild;
  if(after)after.replaceWith(node);else sec.after(node);
  node.querySelectorAll('[data-clan]').forEach(el=>el.addEventListener('click',ev=>clanOnAction(el.getAttribute('data-clan'),el,ev)));
}

function clanOnAction(act,el,ev){
  const id=el.getAttribute('data-id');
  switch(act){
    case 'retry':clanRefreshSoon();break;
    case 'fight':if(typeof goToPage==='function')goToPage('jouer');break;
    case 'tab':_clan.tab=el.getAttribute('data-tab');clanPaint();break;
    case 'found':{
      if(el.getAttribute('aria-disabled')==='true'){
        showNotif('Fonder un clan demande '+CLAN_RULES.foundGames+' parties classées.','info');break;
      }
      clanOpenForge(null);break;
    }
    case 'edit':clanOpenForge(_clan.mine&&_clan.mine.clan);break;
    case 'join':
      clanAct(ecClanJoin(id),null,r=>{
        if(!r)return;
        if(r.pending){showNotif('Demande envoyée : le chef du clan vous répondra.','ok');}
        else{
          showNotif('Bienvenue dans le clan !','ok');
          if(typeof sfxFeel==='function')sfxFeel('warhorn');else if(typeof playSound==='function')playSound('warhorn');
        }
      });
      break;
    case 'view':clanOpenView(id);break;
    case 'claim':clanClaim();break;
    case 'leave':{
      const m=_clan.mine;const solo=m&&m.clan&&(m.clan.members|0)<=1;
      showConfirmModal(solo?'Vous êtes le dernier membre : quitter le clan le dissout définitivement.'
        :'Quitter le clan ? Les points de cette semaine restent au clan, et vous perdez votre rang.',
        ()=>clanAct(ecClanLeave(),solo?'Le clan est dissous.':'Vous avez quitté le clan.'),
        {okLabel:solo?'Dissoudre':'Quitter'});
      break;
    }
    case 'accept':clanAct(ecClanAnswer(id,true),'Nouveau membre accueilli.');break;
    case 'refuse':clanAct(ecClanAnswer(id,false),'Demande refusée.');break;
    case 'member':clanOpenMember(id);break;
    case 'cry':clanOpenCries();break;
  }
}

// -- LE BUTIN : le serveur dit quel coffre, et l'ouvre -------------------
// Le tirage est fait par ec_clan_claim ; le jeu n'en joue que la cérémonie.
function clanClaim(){
  clanAct(ecClanClaim(),null,r=>{
    if(!r||!r.chest)return;
    if(r.state&&typeof ecAdoptState==='function')ecAdoptState(r.state);
    if(typeof playSound==='function')playSound('warhorn');
    if(_clan.mine)_clan.mine.claim=Object.assign({},_clan.mine.claim,{available:false,claimed:true});
    clanPaint();
    if(typeof chestShowLots==='function')setTimeout(()=>chestShowLots(r.chest,r.lots||[]),260);
  });
}

// ----------------------------------------------------------------
// LES FENÊTRES : un clan vu de dehors, un membre, les cris, la forge
// ----------------------------------------------------------------
// Une seule mécanique pour les quatre : une feuille posée sur un voile, que
// le voile, la croix et Échap referment. Une seule ouverte à la fois.
let _clanOv=null;
function clanOverlay(html,cls){
  clanCloseOverlay();
  const ov=document.createElement('div');
  ov.className='clan-ov'+(cls?' '+cls:'');
  ov.innerHTML='<div class="clan-ov-box" role="dialog" aria-modal="true">'+
    '<button class="clan-ov-x" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'+
    html+'</div>';
  document.body.appendChild(ov);
  requestAnimationFrame(()=>ov.classList.add('show'));
  ov.addEventListener('click',e=>{if(e.target===ov)clanCloseOverlay();});
  ov.querySelector('.clan-ov-x').addEventListener('click',clanCloseOverlay);
  _clanOv=ov;
  return ov;
}
function clanCloseOverlay(){
  const ov=_clanOv;if(!ov)return;
  _clanOv=null;
  ov.classList.remove('show');
  setTimeout(()=>ov.remove(),260);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&_clanOv)clanCloseOverlay();});

// -- UN CLAN VU DE DEHORS ----------------------------------------------
function clanOpenView(clanId){
  if(!clanId)return;
  const ov=clanOverlay('<p class="lb-empty">Chargement du clan…</p>','clan-ov-view');
  ecClanView(clanId).then(r=>{
    if(_clanOv!==ov)return;
    if(!r||!r.found){ov.querySelector('.clan-ov-box').insertAdjacentHTML('beforeend','<p class="lb-empty">Ce clan n\'existe plus.</p>');return;}
    const c=r.clan;
    const mine=_clan.mine;
    const inClan=mine&&mine.clan;
    const sent=new Set((mine&&mine.requests_sent)||[]);
    const box=ov.querySelector('.clan-ov-box');
    box.innerHTML=box.querySelector('.clan-ov-x').outerHTML+
      '<div class="clan-view-head" style="--clan-c:'+clanColor(c.blazon)+'">'+
        '<span class="clan-view-blz">'+blazonSVG(c.blazon,{level:c.level})+'</span>'+
        '<h3 class="clan-view-name">'+escH(c.name)+'</h3>'+
        '<div>'+clanTagHTML(c.tag)+' <span class="clan-view-lvl">'+escH(clanLevelName(c.level))+'</span></div>'+
        '<div class="clan-hero-motto">« '+escH(CLAN_MOTTOS[c.motto]||'')+' »</div>'+
      '</div>'+
      '<div class="clan-hero-stats">'+
        '<div class="clan-stat"><b>'+(c.members|0)+'<small>/'+CLAN_RULES.maxMembers+'</small></b><span>Membres</span></div>'+
        '<div class="clan-stat"><b>'+clanNum(c.week_points)+'</b><span>Pts semaine</span></div>'+
        '<div class="clan-stat"><b>'+(c.week_rank?clanOrdinal(c.week_rank):'—')+'</b><span>Au front</span></div>'+
      '</div>'+
      '<div class="clan-view-recruit">Recrutement : <b>'+escH(CLAN_RECRUIT[c.recruit]||'')+'</b>'+(c.min_elo?' · '+c.min_elo+' ELO minimum':'')+'</div>'+
      (!inClan&&c.recruit!=='closed'&&!sent.has(c.id)&&(c.members|0)<CLAN_RULES.maxMembers
        ?'<button class="btn btn-gold clan-view-join" data-id="'+escH(c.id)+'">'+(c.recruit==='request'?'Demander à rejoindre':'Rejoindre ce clan')+'</button>':'')+
      '<div class="rs-sec-title">Membres</div>'+
      '<div class="clan-view-members">'+(r.members||[]).map(x=>
        '<button class="clan-view-mem" data-player="'+escH(x.id)+'"><span class="lb-dot'+(x.online?' on':'')+'"></span>'+
          '<span class="clan-view-mem-name">'+escH(x.username||'?')+'</span>'+
          '<span class="clan-role-chip role-'+escH(x.role)+'">'+escH(CLAN_ROLE[x.role]||'')+'</span>'+
          '<span class="clan-view-mem-pts">'+clanNum(x.week_points)+' pts</span></button>').join('')+'</div>'+
      ((r.events||[]).length?'<div class="rs-sec-title">Derniers faits d\'armes</div><ol class="clan-journal clan-journal-sm">'+r.events.slice(0,8).map(e=>
        '<li class="clan-ev ev-'+escH(e.kind)+'"><span class="clan-ev-txt">'+clanEventText(e)+'</span><span class="clan-ev-at">'+clanAgo(e.at)+'</span></li>').join('')+'</ol>':'');
    box.querySelector('.clan-ov-x').addEventListener('click',clanCloseOverlay);
    box.querySelector('.clan-view-join')?.addEventListener('click',function(){
      clanCloseOverlay();clanOnAction('join',this);
    });
    box.querySelectorAll('[data-player]').forEach(b=>b.addEventListener('click',()=>{
      clanCloseOverlay();
      if(typeof openPlayerProfile==='function'){
        if(typeof openLeaderboardPage==='function')openLeaderboardPage();
        openPlayerProfile(b.getAttribute('data-player'));
      }
    }));
  }).catch(e=>{
    if(_clanOv===ov)ov.querySelector('.clan-ov-box').insertAdjacentHTML('beforeend','<p class="lb-empty">'+escH((e&&e.message)||'Clan indisponible.')+'</p>');
  });
}

// -- UN MEMBRE : profil, défi, rangs -------------------------------------
function clanOpenMember(playerId){
  const m=_clan.mine;if(!m)return;
  const x=(m.members||[]).find(y=>y.id===playerId);if(!x)return;
  const me=m.me||{};
  const myId=(typeof ECP!=='undefined'&&ECP)?ECP.id:null;
  const self=playerId===myId;
  const online=x.online||(typeof mpIsOnline==='function'&&mpIsOnline(x.id));
  const btn=(act,label,cls)=>'<button class="btn '+(cls||'btn-ghost')+'" data-mem="'+act+'">'+label+'</button>';
  let acts=btn('profile','Voir le profil');
  if(!self&&online&&typeof mpChallenge==='function')acts+=btn('duel','Défier en amical','btn-gold');
  if(!self&&me.role==='chef'){
    if(x.role==='membre')acts+=btn('officier','Nommer officier');
    if(x.role==='officier')acts+=btn('membre','Rétrograder en membre');
    acts+=btn('chef','Transmettre la couronne');
  }
  if(!self&&(me.role==='chef'||(me.role==='officier'&&x.role==='membre')))acts+=btn('kick','Exclure du clan','btn-danger');
  const ov=clanOverlay(
    '<div class="clan-mem-sheet">'+
      '<div class="clan-mem-sheet-name">'+escH(x.username||'?')+'</div>'+
      '<div class="clan-mem-sheet-sub"><span class="clan-role-chip role-'+escH(x.role)+'">'+escH(CLAN_ROLE[x.role]||'')+'</span> '+
        (x.elo|0)+' ELO · '+clanNum(x.week_points)+' pts cette semaine · '+clanNum(x.points_total)+' au total</div>'+
      '<div class="clan-mem-acts">'+acts+'</div>'+
    '</div>','clan-ov-sm');
  ov.querySelectorAll('[data-mem]').forEach(b=>b.addEventListener('click',()=>{
    const a=b.getAttribute('data-mem');
    clanCloseOverlay();
    if(a==='profile'){
      if(typeof openLeaderboardPage==='function')openLeaderboardPage();
      if(typeof openPlayerProfile==='function')openPlayerProfile(x.id);
    }
    else if(a==='duel')mpChallenge(x.id,x.username);
    else if(a==='kick')showConfirmModal('Exclure '+(x.username||'ce joueur')+' du clan ?',
      ()=>clanAct(ecClanKick(x.id),'Membre exclu.'),{okLabel:'Exclure'});
    else if(a==='chef')showConfirmModal('Transmettre la couronne à '+(x.username||'ce joueur')+' ? Vous deviendrez officier.',
      ()=>clanAct(ecClanRole(x.id,'chef'),'La couronne a changé de tête.'),{okLabel:'Transmettre',okClass:'btn-gold'});
    else clanAct(ecClanRole(x.id,a),a==='officier'?'Nouvel officier.':'Rang modifié.');
  }));
}

// -- LES CRIS DE GUERRE ----------------------------------------------------
function clanOpenCries(){
  const ov=clanOverlay('<div class="clan-cries-title">Cri de guerre</div>'+
    '<div class="clan-cries">'+CLAN_CRIES.map((t,i)=>'<button class="clan-cry" data-cry="'+i+'">'+escH(t)+'</button>').join('')+'</div>',
    'clan-ov-cries');
  ov.querySelectorAll('[data-cry]').forEach(b=>b.addEventListener('click',()=>{
    const n=+b.getAttribute('data-cry');
    clanCloseOverlay();
    ecClanCry(n).then(r=>{
      if(_clan.mine&&r&&r.events)_clan.mine.events=r.events;
      _clan.tab='journal';clanPaint();
      if(typeof playSound==='function')playSound('warhorn');
    }).catch(e=>{
      showNotif((e&&e.message)||'Le cri s\'est perdu.','err');
    });
  }));
}

// -- LA FORGE : fonder un clan, ou redessiner son blason -----------------
// La moitié haute est l'APERÇU, vivant : le blason, le nom et le sigle tels
// qu'ils paraîtront au front. La moitié basse, les choix — chacun montré
// comme il sera dessiné, jamais comme un mot : une partition se reconnaît,
// elle ne se lit pas.
function clanOpenForge(existing){
  const edit=!!existing;
  const st={
    name:edit?existing.name:'',tag:edit?existing.tag:'',
    blazon:edit?blazonClean(existing.blazon):blazonRandom(),
    motto:edit?(existing.motto|0):Math.floor(Math.random()*CLAN_MOTTOS.length),
    recruit:edit?existing.recruit:'open',min_elo:edit?(existing.min_elo|0):0,
  };
  const lvl=edit?(existing.level|0):0;
  const pick=(field,count,render,label)=>
    '<div class="forge-row"><div class="forge-lbl">'+label+'</div><div class="forge-picks" data-field="'+field+'">'+
      Array.from({length:count},(_,i)=>'<button type="button" class="forge-pick'+(st.blazon[field]===i?' on':'')+'" data-v="'+i+'" title="'+escH(render(i).name)+'" aria-label="'+escH(render(i).name)+'">'+render(i).html+'</button>').join('')+
    '</div></div>';
  const swatch=i=>({name:BLAZON_TINCTURES[i].name,html:'<span class="forge-sw" style="background:'+BLAZON_TINCTURES[i].c+'"></span>'});
  const ov=clanOverlay(
    '<div class="forge">'+
      '<div class="forge-preview">'+
        '<div class="forge-blz" id="forge-blz"></div>'+
        '<div class="forge-prev-name" id="forge-prev-name"></div>'+
        '<div class="forge-prev-motto" id="forge-prev-motto"></div>'+
      '</div>'+
      '<div class="forge-form">'+
        (edit?'':
        '<div class="forge-fields">'+
          '<label class="forge-field"><span>Nom du clan</span><input class="acc-input" id="forge-name" maxlength="24" placeholder="Les Fils du Vif-Argent" value="'+escH(st.name)+'" autocomplete="off"></label>'+
          '<label class="forge-field forge-field-tag"><span>Sigle</span><input class="acc-input" id="forge-tag" maxlength="4" placeholder="VIF" value="'+escH(st.tag)+'" autocomplete="off" autocapitalize="characters"></label>'+
        '</div>')+
        '<div class="forge-row forge-row-dice"><div class="forge-lbl">Blason</div><button type="button" class="btn btn-ghost forge-dice" id="forge-dice">Au hasard</button></div>'+
        pick('s',BLAZON_SPEC.s,i=>({name:BLAZON_SHAPES[i].name,html:blazonSVG(Object.assign({},st.blazon,{s:i,ch:13}),{plain:true})}),'Forme')+
        pick('d',BLAZON_SPEC.d,i=>({name:BLAZON_DIVISIONS[i].name,html:blazonSVG(Object.assign({},st.blazon,{s:0,d:i,ch:13}),{plain:true})}),'Partition')+
        pick('c1',BLAZON_SPEC.c1,swatch,'Premier émail')+
        pick('c2',BLAZON_SPEC.c2,swatch,'Second émail')+
        pick('ch',BLAZON_SPEC.ch,i=>({name:BLAZON_CHARGES[i].name,html:blazonSVG(Object.assign({},st.blazon,{s:0,d:0,ch:i}),{plain:true})}),'Meuble')+
        pick('cc',BLAZON_SPEC.cc,swatch,'Émail du meuble')+
        '<div class="forge-row"><div class="forge-lbl">Devise</div>'+
          '<select class="acc-input forge-motto" id="forge-motto">'+CLAN_MOTTOS.map((t,i)=>'<option value="'+i+'"'+(i===st.motto?' selected':'')+'>'+escH(t)+'</option>').join('')+'</select></div>'+
        '<div class="forge-row"><div class="forge-lbl">Recrutement</div><div class="forge-seg" id="forge-recruit">'+
          Object.keys(CLAN_RECRUIT).map(k=>'<button type="button" class="forge-seg-b'+(st.recruit===k?' on':'')+'" data-v="'+k+'">'+CLAN_RECRUIT[k]+'</button>').join('')+'</div></div>'+
        '<div class="forge-row"><div class="forge-lbl">ELO minimum</div><div class="forge-step">'+
          '<button type="button" class="forge-step-b" data-step="-100" aria-label="Moins">−</button>'+
          '<span id="forge-min">'+st.min_elo+'</span>'+
          '<button type="button" class="forge-step-b" data-step="100" aria-label="Plus">+</button></div></div>'+
        '<button class="btn btn-gold forge-go" id="forge-go">'+(edit?'Enregistrer':'Fonder le clan')+'</button>'+
      '</div>'+
    '</div>','clan-ov-forge');

  const paintPreview=()=>{
    ov.querySelector('#forge-blz').innerHTML=blazonSVG(st.blazon,{level:lvl});
    const nm=edit?st.name:(ov.querySelector('#forge-name').value.trim()||'Votre clan');
    const tg=edit?st.tag:(ov.querySelector('#forge-tag').value.trim().toUpperCase()||'—');
    ov.querySelector('#forge-prev-name').innerHTML=escH(nm)+' '+clanTagHTML(tg);
    ov.querySelector('#forge-prev-motto').textContent='« '+CLAN_MOTTOS[st.motto]+' »';
    // Les vignettes de forme, de partition et de meuble se redessinent
    // AVEC les émaux choisis : on choisit une partition en la voyant aux
    // couleurs de son clan, pas en rouge et blanc de catalogue.
    ov.querySelectorAll('.forge-picks').forEach(g=>{
      const f=g.dataset.field;
      g.querySelectorAll('.forge-pick').forEach(b=>{
        const i=+b.dataset.v;
        b.classList.toggle('on',st.blazon[f]===i);
        if(f==='s')b.innerHTML=blazonSVG(Object.assign({},st.blazon,{s:i}),{plain:true});
        else if(f==='d')b.innerHTML=blazonSVG(Object.assign({},st.blazon,{d:i,ch:13}),{plain:true});
        else if(f==='ch')b.innerHTML=blazonSVG(Object.assign({},st.blazon,{ch:i}),{plain:true});
      });
    });
  };
  ov.querySelectorAll('.forge-picks').forEach(g=>g.addEventListener('click',e=>{
    const b=e.target.closest('.forge-pick');if(!b)return;
    st.blazon[g.dataset.field]=+b.dataset.v;paintPreview();
    if(typeof playSound==='function')playSound('tap');
  }));
  ov.querySelector('#forge-dice').addEventListener('click',()=>{
    st.blazon=blazonRandom();paintPreview();
    ov.querySelector('#forge-blz').classList.remove('roll');void ov.querySelector('#forge-blz').offsetWidth;
    ov.querySelector('#forge-blz').classList.add('roll');
    if(typeof playSound==='function')playSound('loot');
  });
  ov.querySelector('#forge-motto').addEventListener('change',function(){st.motto=+this.value;paintPreview();});
  ov.querySelectorAll('#forge-recruit .forge-seg-b').forEach(b=>b.addEventListener('click',()=>{
    st.recruit=b.dataset.v;
    ov.querySelectorAll('#forge-recruit .forge-seg-b').forEach(x=>x.classList.toggle('on',x===b));
  }));
  ov.querySelectorAll('.forge-step-b').forEach(b=>b.addEventListener('click',()=>{
    st.min_elo=Math.max(0,Math.min(2500,st.min_elo+(+b.dataset.step)));
    ov.querySelector('#forge-min').textContent=st.min_elo;
  }));
  if(!edit){
    const tag=ov.querySelector('#forge-tag');
    ov.querySelector('#forge-name').addEventListener('input',paintPreview);
    tag.addEventListener('input',()=>{
      // Le sigle s'écrit en capitales, sans accent : on le montre tel que
      // le serveur l'enregistrera, au lieu de le refuser après coup.
      const v=tag.value.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
      if(v!==tag.value)tag.value=v;
      paintPreview();
    });
  }
  ov.querySelector('#forge-go').addEventListener('click',()=>{
    const payload={blazon:st.blazon,motto:st.motto,recruit:st.recruit,min_elo:st.min_elo};
    if(edit){
      clanAct(ecClanEdit(payload),'Blason enregistré.',r=>{if(r)clanCloseOverlay();});
      return;
    }
    payload.name=ov.querySelector('#forge-name').value.trim();
    payload.tag=ov.querySelector('#forge-tag').value.trim();
    if(payload.name.length<3){showNotif('Le nom du clan doit faire entre 3 et 24 caractères.','err');return;}
    if(!/^[A-Z0-9]{2,4}$/.test(payload.tag)){showNotif('Le sigle fait 2 à 4 lettres ou chiffres, sans accent.','err');return;}
    clanAct(ecClanCreate(payload),null,r=>{
      if(!r||!r.clan)return;
      clanCloseOverlay();
      _clan.tab='front';
      clanCelebrate(r.clan);
    });
  });
  paintPreview();
}

// LA FONDATION A SA CÉRÉMONIE : le blason tombe au centre de l'écran sous
// un cor de guerre, puis rejoint la page. Une seule fois dans la vie d'un
// clan — elle a le droit de prendre deux secondes.
function clanCelebrate(c){
  if(typeof sfxFeel==='function')sfxFeel('warhorn');else if(typeof playSound==='function')playSound('warhorn');
  const el=document.createElement('div');
  el.className='clan-cele';
  el.innerHTML='<div class="clan-cele-rays"></div><div class="clan-cele-blz">'+blazonSVG(c.blazon,{level:c.level})+'</div>'+
    '<div class="clan-cele-txt"><div class="clan-cele-kicker">Un clan est né</div><div class="clan-cele-name">'+escH(c.name)+' '+clanTagHTML(c.tag)+'</div></div>';
  document.body.appendChild(el);
  const done=()=>{el.classList.add('out');setTimeout(()=>el.remove(),500);};
  el.addEventListener('click',done);
  setTimeout(done,2600);
}

// ----------------------------------------------------------------
// LE CLAN HORS DE SA PAGE
// ----------------------------------------------------------------
// Le sigle et le blason se lisent dans la fiche du joueur (ECP.clan) : le
// rail d'ordinateur, le menu et le verdict de fin de partie le montrent
// sans appel de plus.
// Le clan a changé (fondé, rejoint, quitté) : le menu et le rail le disent
// tout de suite, sans attendre la prochaine visite du menu.
function clanPaintRail(){
  if(typeof renderMenuIdentity==='function')renderMenuIdentity();
}
function clanBriefHTML(cls){
  const c=(typeof ECP!=='undefined'&&ECP)?ECP.clan:null;
  if(!c)return '';
  return '<span class="clan-brief '+(cls||'')+'" title="'+escH(c.name)+'">'+
    '<span class="clan-brief-blz">'+blazonSVG(c.blazon,{level:c.level,plain:true})+'</span>'+clanTagHTML(c.tag)+'</span>';
}

// LES POINTS DE GUERRE DANS LE VERDICT. ec_report_match renvoie ce que la
// partie a rapporté au clan (`clan`) ; on l'ajoute sous l'ELO de la fenêtre
// de résultat. Rien si le joueur n'a pas de clan, ou si la partie n'était
// pas classée.
function clanResultNote(rep){
  const box=document.getElementById('result-box');
  if(!box)return;
  box.querySelector('.result-clan')?.remove();
  if(!rep||!rep.clan)return;
  const c=rep.clan;
  const el=document.createElement('div');
  el.className='result-clan';
  el.innerHTML='<span class="result-clan-blz">'+blazonSVG(c.blazon,{level:c.level,plain:true})+'</span>'+
    '<span class="result-clan-txt"><b>+'+(c.points|0)+'</b> points de guerre pour '+clanTagHTML(c.tag)+
    (c.capped?' <em>(plafond du jour)</em>':'')+
    '<small>'+(c.week_rank?clanOrdinal(c.week_rank)+' au front · ':'')+clanNum(c.week_points)+' pts cette semaine</small></span>';
  const anchor=box.querySelector('.result-elo-row');
  if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(el,anchor.nextSibling);
  else box.appendChild(el);
  // Le front a bougé : la page se relira à la prochaine visite.
  _clan.at=0;
}
