// ================================================================
// ACCOUNT-UI.JS : la page Comptes (#page-account)
// ================================================================
// L'écran d'identité du joueur. Il n'existait pas : le jeu n'avait qu'un
// compte, choisi une fois par un formulaire de pseudo, et plus jamais
// modifiable. On y fait maintenant les quatre choses qu'on attend d'un
// compte : se voir, se renommer, en créer un autre, passer de l'un à l'autre.
//
// TROIS BLOCS, DANS L'ORDRE DE CE QU'ON VIENT Y FAIRE :
//
//   1. LE SCEAU. Le compte courant en grand : médaillon frappé à sa
//      première lettre, aux couleurs de son rang, pseudo, rang et ELO, puis
//      quatre chiffres qui résument la partie sérieuse (parties classées,
//      victoires, perles, meilleur rang atteint). C'est la seule page du jeu
//      qui récapitule ce qu'un compte a accompli — la Diagonale, elle, ne
//      montre que ce qui reste à débloquer (voir renderVoiePage, js/voie.js).
//
//   2. LES AUTRES COMPTES. Une ligne par compte, avec son rang et son ELO
//      lus sur le SERVEUR, sans s'y connecter (ec_profile). Toucher la
//      ligne bascule dessus, la corbeille efface le compte — sur le serveur
//      aussi, et définitivement.
//
//   3. NOUVEAU COMPTE. Un champ, un bouton. Le compte créé reçoit le Lore et
//      le tutoriel, comme un premier lancement.
//
// CHAQUE ACTION DESTRUCTRICE OU IRRÉVERSIBLE PASSE PAR showConfirmModal, et
// change de compte pendant une partie est refusé net : il n'y a pas de
// « sauvegarde de partie en cours », abandonner le plateau le perdrait
// vraiment (et, en ligne, laisserait l'adversaire seul).
//
// Dépendances : server.js (ECP, ecProfileOf), accounts.js (CUR_ACC,
// accountsList, accountCreate, accountSwitch, accountRename, accountDelete,
// accountsNameError),
// data-pieces.js (vvGetRank, RANKS), economy.js (pearlBalance),
// main.js (escH, showPage, showNotif, showConfirmModal),
// cube-nav.js (goToMainMenu).
// Utilisé par : settings-admin.js (la ligne « Compte » du panneau de
// réglages ouvre cette page), accounts.js (updateCab la rafraîchit).
// ================================================================

const ACCOUNT_PAGE_ID='page-account';

// ----------------------------------------------------------------
// OUVERTURE / FERMETURE
// ----------------------------------------------------------------
function openAccountPage(){
  // Le panneau de réglages reste ouvert derrière sinon : il est ancré au
  // menu principal, la page Comptes le recouvre, et on le retrouve ouvert
  // en revenant.
  document.getElementById('settings-panel')?.classList.remove('open');
  // À chaque ouverture, on redemande : la place au classement bouge à chaque
  // partie — la sienne comme celles des autres. Une valeur mise en cache
  // d'une visite à l'autre serait fausse la plupart du temps.
  accountForgetRemote();
  renderAccountPage();
  showPage(ACCOUNT_PAGE_ID);
}
function closeAccountPage(){
  _accRenaming=false;_accRenameDraft=null;
  if(typeof goToMainMenu==='function')goToMainMenu();
  else showPage('page-builder');
}

// Rafraîchissement passif : appelé par updateCab (js/accounts.js) à chaque
// changement d'ELO. Ne fait rien si la page n'est pas à l'écran, pour ne pas
// reconstruire un DOM que personne ne regarde.
function accountUIRefresh(){
  const p=document.getElementById(ACCOUNT_PAGE_ID);
  if(p&&p.classList.contains('active'))renderAccountPage();
}

// ----------------------------------------------------------------
// PETITES LECTURES
// ----------------------------------------------------------------
// Le résumé d'un compte. Celui du joueur vient de la fiche que le serveur a
// donnée (ECP, js/server.js) : c'est la seule source, il n'y a plus rien à
// lire dans le navigateur. Celui d'un AUTRE compte de cet appareil vient de sa
// fiche publique, rapatriée à l'ouverture de la page — d'où le cache
// ci-dessous et le rendu en deux temps : la ligne s'affiche tout de suite avec
// son pseudo, ses chiffres arrivent une fraction de seconde plus tard.
const _accOther={};      // pseudo → fiche publique du serveur
let _accMyRank=null;     // ma place au classement général, null si je n'y figure pas
// L'ÉTAT DE LA DEMANDE EST À PART DE SA VALEUR, et ce n'est pas de la
// coquetterie : `null` est une RÉPONSE parfaitement valable — c'est celle
// qu'on reçoit tant qu'on n'a pas joué de partie classée. Confondre les deux
// (« null = pas encore demandé ») faisait redemander à chaque rendu, et
// comme chaque réponse re-rend la page, la page Comptes se figeait dans une
// boucle sur tout compte neuf. NE PAS REVENIR EN ARRIÈRE.
let _accRankState='idle';   // 'idle' | 'pending' | 'done'

function accountSummaryFrom(p,username){
  const elo=p?(p.elo|0):0;
  const peak=p?Math.max(elo,p.elo_peak|0):0;
  const rank=(typeof vvGetRank==='function')?vvGetRank(peak):{name:'',color:'var(--muted)'};
  return{
    username:(p&&p.username)||username,
    elo,peak,rank,
    games:p?(p.ranked_games|0):0,
    wins:p?(p.ranked_wins|0):0,
    bestStreak:p?(p.best_streak|0):0,
    pieceStats:(p&&p.piece_stats)||{},
    history:(p&&(p.history||p.match_history))||[],
    // CE QUE LE JOUEUR PEUT ALIGNER (voir profileArsenalHTML, js/replay.js).
    // Pour les autres comptes de l'appareil, ça vient de leur fiche publique ;
    // pour le compte courant, accountSummary() le remplace par l'état local,
    // qui est plus frais que la copie serveur d'il y a trois secondes.
    army:(p&&p.pub_army)||[],
    unlocked:(p&&p.pub_unlocked)||[],
    pearls:0,
    loading:!p,
  };
}

function accountSummary(username){
  if(username===CUR_ACC&&typeof ECP!=='undefined'&&ECP){
    const s=accountSummaryFrom(ECP,username);
    s.pearls=accGet('pearls',0)||0;
    s.rankPos=_accMyRank;
    // Sur SON PROPRE profil, l'armée et les déblocages se lisent en mémoire :
    // ECP.pub_army n'existe pas (la fiche complète porte `state`, pas la
    // projection publique) et, surtout, une pièce débloquée il y a dix
    // secondes doit apparaître tout de suite.
    if(typeof savedArmies!=='undefined')s.army=savedArmies;
    if(typeof VV_UNLOCKED!=='undefined')s.unlocked=[...VV_UNLOCKED];
    return s;
  }
  return accountSummaryFrom(_accOther[username]||null,username);
}

// Rapatrie ce qui manque : ma place au classement, et la fiche des autres
// comptes de cet appareil. Chaque réponse re-rend la page — elle est courte,
// et c'est plus honnête qu'un écran figé le temps de tout attendre.
function accountFetchRemote(){
  if(_accRankState==='idle'&&typeof ECP!=='undefined'&&ECP){
    _accRankState='pending';
    ecProfileOf({id:ECP.id}).then(p=>{
      _accRankState='done';
      _accMyRank=(p&&p.found&&typeof p.rank==='number')?p.rank:null;
      accountUIRefresh();
    }).catch(()=>{_accRankState='done';});   // 'done' même en échec : on ne réessaie pas en boucle
  }
  // Même règle pour les autres comptes : la fiche vide posée AVANT l'appel
  // marque la demande, donc un compte introuvable n'est pas redemandé à
  // chaque rendu.
  accountsList().forEach(u=>{
    if(u===CUR_ACC||_accOther[u])return;
    _accOther[u]={username:u,elo:0,elo_peak:0,ranked_games:0,ranked_wins:0,best_streak:0};
    ecProfileOf({username:u}).then(p=>{
      if(p&&p.found)_accOther[u]=p;
      accountUIRefresh();
    }).catch(()=>{});
  });
}

// Le rang et les fiches voisines sont à redemander après un changement qui
// les périme : une partie classée vient d'être jouée, un compte vient d'être
// supprimé. Sans cela, la page montrerait la place d'avant.
function accountForgetRemote(){
  _accRankState='idle';
  Object.keys(_accOther).forEach(k=>{delete _accOther[k];});
}

// LA CRÉATURE FÉTICHE : celle qu'on aligne le plus, avec ce qu'elle rapporte
// vraiment. C'est la statistique que réclame un joueur qui compose son armée,
// et la seule que le jeu était en mesure de donner sans serveur.
// Un minimum de parties est exigé : « 100 % de victoires » sur une seule
// partie n'apprend rien à personne et se lit comme une promesse fausse.
const ACC_FETICHE_MIN=5;
function accountFavourite(s){
  let best=null;
  Object.keys(s.pieceStats||{}).forEach(id=>{
    const e=s.pieceStats[id];
    if(!e||e.g<ACC_FETICHE_MIN)return;
    if(!best||e.g>best.g)best={id,g:e.g,w:e.w};
  });
  if(!best)return null;
  const p=(typeof PIECES!=='undefined')?PIECES.find(x=>x.id===best.id):null;
  if(!p)return null;
  return{piece:p,games:best.g,wins:best.w,rate:Math.round(best.w/best.g*100)};
}

// Les dix dernières parties, DE LA PLUS ANCIENNE À LA PLUS RÉCENTE. Une
// pastille par partie : c'est la forme la plus dense qui reste lisible, et
// elle dit d'un coup d'oeil si l'on est en train de monter ou de couler.
//
// Elles se lisaient à l'envers, la plus récente à gauche. Or une bande de
// forme est une frise : le temps y va de gauche à droite, comme dans toutes
// les courbes qu'on a jamais lues. À l'envers, une remontée ressemblait à une
// chute — c'est le contraire de ce que la bande est censée dire.
const ACC_RECENT=10;
function accountRecent(s){
  return (s.history||[]).filter(h=>h&&h.ranked!==false).slice(-ACC_RECENT);
}

// Le médaillon : la première lettre du pseudo, frappée dans un disque teinté
// de la couleur du rang. Une lettre plutôt qu'une image parce qu'aucun compte
// n'a d'avatar à téléverser, et une couleur de rang plutôt qu'une couleur
// tirée du pseudo parce que le rang est la seule chose qu'un joueur a gagnée.
function accountMedallion(s,cls){
  const letter=escH((s.username||'?').trim().charAt(0).toUpperCase()||'?');
  return '<span class="acc-medal '+(cls||'')+'" style="--medal-c:'+s.rank.color+'">'+
           '<span class="acc-medal-letter">'+letter+'</span>'+
         '</span>';
}

// ----------------------------------------------------------------
// RENDU
// ----------------------------------------------------------------
let _accRenaming=false;   // le champ de renommage est-il ouvert ?
// Ce que le joueur a tapé, conservé d'un rendu à l'autre. Sans lui, un
// pseudo refusé (trop court, déjà pris) réapparaissait effacé : on
// punissait deux fois la même faute de frappe.
let _accRenameDraft=null;

function renderAccountPage(){
  const host=document.getElementById('account-body');
  if(!host||!CUR_ACC)return;
  accountFetchRemote();
  const me=accountSummary(CUR_ACC);
  const others=accountsList().filter(u=>u!==CUR_ACC).map(accountSummary);
  const full=accountsList().length>=ACC_MAX;

  host.innerHTML=
    accountSealHTML(me)+
    accountSwitchHTML(others)+
    accountCreateHTML(full);

  wireAccountPage();
}

// --- 1. LE SCEAU : le compte courant ---
function accountSealHTML(s){
  // QUATRE CHIFFRES, ET AUCUN QUI SE DÉDUISE D'UN AUTRE. « Parties » et
  // « Victoires » côte à côte obligeaient le joueur à faire la division de
  // tête : le taux de victoire prend la place du total de victoires, qui
  // reste lisible dans la phrase sous les chiffres.
  const rate=s.games?Math.round(s.wins/s.games*100):null;
  const stats=[
    {k:'Parties classées',v:s.games},
    {k:'Victoires',       v:rate===null?'—':rate+'\u00a0%'},
    {k:'Meilleure série',  v:s.bestStreak},
    {k:'Meilleur ELO',    v:s.peak},
  ];
  return ''+
  '<section class="acc-seal">'+
    '<div class="acc-seal-top">'+
      accountMedallion(s,'acc-medal-lg')+
      '<div class="acc-seal-id">'+
        (_accRenaming
          ? '<div class="acc-rename-row">'+
              '<input class="acc-input" id="acc-rename-input" type="text" maxlength="'+ACC_NAME_MAX+'" '+
                'value="'+escH(_accRenameDraft!==null?_accRenameDraft:s.username)+'" autocomplete="off" spellcheck="false" aria-label="Nouveau pseudo">'+
              '<button class="btn btn-primary acc-mini-btn" id="acc-rename-ok">Valider</button>'+
              '<button class="btn btn-ghost acc-mini-btn" id="acc-rename-cancel">Annuler</button>'+
            '</div>'
          : '<div class="acc-name-line">'+
              '<h2 class="acc-name">'+escH(s.username)+'</h2>'+
              '<button class="acc-icon-btn" id="acc-rename-open" title="Renommer ce compte" aria-label="Renommer ce compte">'+
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
                  '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 6.5l3 3"/>'+
                '</svg>'+
              '</button>'+
            '</div>')+
        '<div class="acc-rank-line">'+
          '<span class="acc-rank" style="color:'+s.rank.color+'">'+escH(s.rank.name)+'</span>'+
          '<span class="acc-dot"></span>'+
          '<span class="acc-elo">'+s.elo+' ELO</span>'+
          // LA PLACE AU CLASSEMENT GÉNÉRAL. Elle n'existait pas : sans
          // serveur, un ELO ne se comparait à personne. Toucher la pastille
          // ouvre le classement, à sa propre ligne.
          (s.rankPos?'<button class="acc-worldrank" id="acc-open-lb" title="Voir le classement général">#'+s.rankPos+' mondial</button>':'')+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="acc-stats">'+
      stats.map(x=>'<div class="acc-stat"><div class="acc-stat-v">'+x.v+'</div><div class="acc-stat-k">'+x.k+'</div></div>').join('')+
    '</div>'+
    accountFormHTML(s)+
    accountFavouriteHTML(s)+
    // CE QU'ON ALIGNE, ET CE QU'ON A REJOUABLE. Les deux mêmes blocs que sur
    // le profil de n'importe qui d'autre (js/replay.js) : un profil doit se
    // lire pareil qu'il soit le sien ou celui d'un inconnu, sinon on ne peut
    // rien comparer avant un duel.
    ((typeof profileArsenalHTML==='function')?profileArsenalHTML(s.army,s.unlocked):'')+
    ((typeof replayListHTML==='function')?replayListHTML(s.history):'')+
    // PLUS DE « QUITTER CE COMPTE ». Il n'y a rien à quitter : le jeu n'a ni
    // mot de passe ni session, et la seule chose que le bouton faisait —
    // repasser par la page de connexion — se fait déjà en choisissant un
    // autre compte dans la liste juste en dessous.
  '</section>';
}

// LA BANDE DE FORME : dix pastilles, la plus récente à gauche. Le jeu
// enregistrait le résultat de chaque partie depuis toujours et n'en montrait
// rien — or « est-ce que je monte ou est-ce que je coule » est la première
// question qu'on se pose en ouvrant son profil, et c'est la seule à laquelle
// une liste de chiffres ne répond pas.
function accountFormHTML(s){
  const recent=accountRecent(s);
  if(!recent.length)return '';
  const lbl={win:'Victoire',loss:'Défaite',draw:'Nulle'};
  return ''+
  '<div class="acc-form">'+
    '<div class="acc-form-k">Forme récente</div>'+
    '<div class="acc-form-dots">'+
      recent.map(h=>{
        const cls=h.result==='win'?'w':h.result==='loss'?'l':'d';
        const d=(h.delta>0?'+':'')+(h.delta||0);
        const quand=h.date?new Date(h.date).toLocaleDateString():'';
        return '<span class="acc-dot-'+cls+'" title="'+escH((lbl[h.result]||'')+' · '+d+' ELO'+(quand?' · '+quand:''))+'"></span>';
      }).join('')+
    '</div>'+
  '</div>';
}

// LA CRÉATURE FÉTICHE. Elle répond à la question que se pose un joueur devant
// son armée : « est-ce que celle-là me réussit ? ». La même fiche se lit
// maintenant sur le profil de n'importe qui (lbFavouriteHTML,
// js/leaderboard.js) : on peut donc comparer sa fétiche à celle d'un
// adversaire avant de le défier.
function accountFavouriteHTML(s){
  const f=accountFavourite(s);
  if(!f)return '';
  const icone=(typeof pieceIcon==='function')?pieceIcon(f.piece.id,'n'):'';
  return ''+
  '<div class="acc-fav">'+
    '<span class="acc-fav-icon">'+icone+'</span>'+
    '<div class="acc-fav-txt">'+
      '<div class="acc-fav-name">'+escH(f.piece.name)+'</div>'+
      '<div class="acc-fav-sub">Votre créature fétiche · '+f.games+' parties, '+f.rate+'\u00a0% de victoires</div>'+
    '</div>'+
  '</div>';
}

// --- 2. LES AUTRES COMPTES ---
function accountSwitchHTML(others){
  if(!others.length){
    return ''+
    '<section class="acc-sec">'+
      '<h3 class="acc-sec-title">Changer de compte</h3>'+
      '<p class="acc-empty">Ce compte est le seul sur cet appareil. Créez-en un autre ci-dessous '+
        'pour repartir de zéro sans perdre celui-ci.</p>'+
    '</section>';
  }
  return ''+
  '<section class="acc-sec">'+
    '<h3 class="acc-sec-title">Changer de compte</h3>'+
    '<div class="acc-list">'+
      others.map(s=>''+
        '<div class="acc-row">'+
          '<button class="acc-row-main" data-switch="'+escH(s.username)+'">'+
            accountMedallion(s)+
            '<span class="acc-row-id">'+
              '<span class="acc-row-name">'+escH(s.username)+'</span>'+
              '<span class="acc-row-sub"><span style="color:'+s.rank.color+'">'+escH(s.rank.name)+'</span>'+
                ' · '+s.elo+' ELO · '+s.games+(s.games>1?' parties':' partie')+'</span>'+
            '</span>'+
            '<span class="acc-row-go" aria-hidden="true">'+
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5, 16 12, 9 19"/></svg>'+
            '</span>'+
          '</button>'+
          '<button class="acc-icon-btn acc-del" data-del="'+escH(s.username)+'" title="Supprimer ce compte" aria-label="Supprimer le compte '+escH(s.username)+'">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
              '<path d="M4 7h16"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7l1 12.5h9L17.5 7"/><path d="M10 11v5M14 11v5"/>'+
            '</svg>'+
          '</button>'+
        '</div>').join('')+
    '</div>'+
  '</section>';
}

// --- 3. NOUVEAU COMPTE ---
function accountCreateHTML(full){
  if(full){
    return ''+
    '<section class="acc-sec">'+
      '<h3 class="acc-sec-title">Nouveau compte</h3>'+
      '<p class="acc-empty">Cet appareil porte déjà '+ACC_MAX+' comptes, le maximum. '+
        'Supprimez-en un pour pouvoir en créer un autre.</p>'+
    '</section>';
  }
  return ''+
  '<section class="acc-sec">'+
    '<h3 class="acc-sec-title">Nouveau compte</h3>'+
    '<div class="acc-create-row">'+
      '<input class="acc-input" id="acc-new-input" type="text" maxlength="'+ACC_NAME_MAX+'" '+
        'placeholder="Pseudo du nouveau compte" autocomplete="off" spellcheck="false" aria-label="Pseudo du nouveau compte">'+
      '<button class="btn btn-primary acc-mini-btn" id="acc-new-ok">Créer</button>'+
    '</div>'+
  '</section>';
}

// ----------------------------------------------------------------
// BRANCHEMENTS
// ----------------------------------------------------------------
// Le HTML est reconstruit à chaque rendu : les écouteurs se reposent donc
// ici, sur les éléments qui viennent d'être créés. C'est le même parti pris
// que le reste du jeu (voir renderArmiesPage, js/armies.js).
function wireAccountPage(){
  const host=document.getElementById('account-body');
  if(!host)return;

  // Ses dix dernières parties : chaque ligne ouvre le mode analyse
  // (js/replay.js), et « Retour » ramène ici — pas au menu, sinon relire deux
  // parties à la suite demanderait de refaire tout le chemin.
  if(typeof wireReplayList==='function'&&CUR_ACC){
    wireReplayList(host,accountSummary(CUR_ACC).history,{
      me:CUR_ACC,meSub:((typeof vvLoadElo==='function')?vvLoadElo():0)+' ELO',
      back:()=>{if(typeof openAccountPage==='function')openAccountPage();},
    });
  }

  host.querySelector('#acc-rename-open')?.addEventListener('click',()=>{
    _accRenaming=true;_accRenameDraft=null;renderAccountPage();
    const i=document.getElementById('acc-rename-input');
    if(i){i.focus();i.select();}
  });
  host.querySelector('#acc-rename-cancel')?.addEventListener('click',()=>{
    _accRenaming=false;_accRenameDraft=null;renderAccountPage();
  });
  const doRename=()=>{
    const v=document.getElementById('acc-rename-input')?.value||'';
    // Le champ se referme AVANT l'appel : accountRename passe par updateCab,
    // qui re-rend cette page. Le laisser ouvert ferait dessiner le champ une
    // fois de trop, avec le focus perdu entre les deux.
    _accRenaming=false;
    renderAccountPage();
    // LE VERDICT VIENT DU SERVEUR, et lui seul : c'est là qu'un pseudo est
    // unique pour tout le monde. On referme le champ pendant l'aller-retour
    // et on le rouvre, garni de ce qui a été tapé, si le nom est refusé.
    accountRename(v).then(()=>{
      _accRenameDraft=null;
      showNotif('Compte renommé.','ok');
      renderAccountPage();
    }).catch(e=>{
      _accRenaming=true;_accRenameDraft=v;
      showNotif((e&&e.message)||'Renommage impossible.','err');
      renderAccountPage();
      document.getElementById('acc-rename-input')?.focus();
    });
  };
  host.querySelector('#acc-rename-ok')?.addEventListener('click',doRename);
  host.querySelector('#acc-rename-input')?.addEventListener('keydown',e=>{
    if(e.key==='Enter')doRename();
    if(e.key==='Escape'){_accRenaming=false;_accRenameDraft=null;renderAccountPage();}
  });

  host.querySelector('#acc-open-lb')?.addEventListener('click',()=>{
    if(typeof openLeaderboardPage==='function')openLeaderboardPage();
  });

  host.querySelectorAll('[data-switch]').forEach(b=>{
    b.addEventListener('click',()=>accountAskSwitch(b.getAttribute('data-switch')));
  });
  host.querySelectorAll('[data-del]').forEach(b=>{
    b.addEventListener('click',()=>accountAskDelete(b.getAttribute('data-del')));
  });

  const doCreate=()=>{
    const v=document.getElementById('acc-new-input')?.value||'';
    // Le nom est validé AVANT la confirmation : faire confirmer un
    // changement de compte pour ensuite refuser le pseudo serait deux fois
    // désagréable.
    const err=accountsNameError(v);
    if(err){showNotif(err,'err');return;}
    if(accountBusy())return;
    showConfirmModal(
      'Créer le compte « '+v.trim()+' » et basculer dessus ? Le compte '+CUR_ACC+' est conservé.',
      ()=>{
        showNotif('Création du compte…','ok');
        accountCreate(v).catch(e=>showNotif((e&&e.message)||'Création impossible.','err'));
      },
      {okLabel:'Créer',okClass:'btn-primary'});
  };
  host.querySelector('#acc-new-ok')?.addEventListener('click',doCreate);
  host.querySelector('#acc-new-input')?.addEventListener('keydown',e=>{
    if(e.key==='Enter')doCreate();
  });
}

// Changer de compte, ou en supprimer un, abandonne la partie en cours : en
// ligne cela laisserait l'adversaire seul devant un plateau, et hors ligne
// cela perdrait les pièces engagées. On refuse plutôt que de le faire
// silencieusement.
function accountBusy(){
  // On se fie à ce qui est À L'ÉCRAN, pas à l'objet GS : GS survit à la fin
  // d'une partie et à un tutoriel abandonné, il resterait donc « en partie »
  // longtemps après le retour au menu. cubeIsInGame (js/cube-nav.js) dit si
  // la face partie est bien devant et le cube verrouillé.
  const playing=typeof cubeIsInGame==='function'&&cubeIsInGame()
    &&typeof GS!=='undefined'&&GS&&!GS.gameOver;
  if(playing){
    showNotif('Terminez ou abandonnez la partie en cours avant de changer de compte.','err');
    return true;
  }
  return false;
}

// CHANGER DE COMPTE NE SE CONFIRME PLUS. La confirmation annonçait le rang et
// l'ELO du compte visé et promettait que l'actuel serait conservé : trois
// choses que la ligne qu'on vient de toucher affiche déjà, pour une action qui
// ne détruit rien et se défait en touchant la ligne d'à côté. On ne fait
// confirmer que ce qui se perd — c'est ce qui donne son poids à la
// confirmation de suppression, juste en dessous.
//
// Le refus en pleine partie, lui, reste (accountBusy) : celui-là abandonnerait
// vraiment quelque chose.
function accountAskSwitch(username){
  if(!username||accountBusy())return;
  accountSwitch(username);
}

function accountAskDelete(username){
  if(!username)return;
  // L'INVENTAIRE DU COMPTE N'EST PAS RÉCITÉ. « Ses 13 parties classées, ses
  // créatures et ses 903 perles seront perdues » : trois chiffres à lire au
  // moment où l'on veut juste savoir si on appuie ou non. « Définitivement » et
  // « irréversible » disent tout ce qu'il faut savoir pour décider.
  showConfirmModal(
    'Supprimer définitivement « '+username+' » ? Cette action est irréversible.',
    ()=>{
      accountDelete(username).then(()=>{
        accountForgetRemote();
        showNotif('Compte « '+username+' » supprimé.','ok');
        renderAccountPage();
      }).catch(e=>showNotif((e&&e.message)||'Suppression impossible.','err'));
    },
    {okLabel:'Supprimer',okClass:'btn-danger'});
}

// ----------------------------------------------------------------
// ENTRÉES DANS LA PAGE
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('acc-close')?.addEventListener('click',closeAccountPage);
  document.getElementById('sp-account')?.addEventListener('click',openAccountPage);
});
