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
//      lus SANS s'y connecter (accGetFor, js/accounts.js). Toucher la ligne
//      bascule dessus, la corbeille l'efface.
//
//   3. NOUVEAU COMPTE. Un champ, un bouton. Le compte créé reçoit le Lore et
//      le tutoriel, comme un premier lancement.
//
// CHAQUE ACTION DESTRUCTRICE OU IRRÉVERSIBLE PASSE PAR showConfirmModal, et
// change de compte pendant une partie est refusé net : il n'y a pas de
// « sauvegarde de partie en cours », abandonner le plateau le perdrait
// vraiment (et, en ligne, laisserait l'adversaire seul).
//
// Dépendances : accounts.js (CUR_ACC, accountsList, accGetFor, accountCreate,
// accountSwitch, accountRename, accountDelete, accountsNameError),
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
// Le résumé d'un compte, lu depuis ses clés de stockage. Fonctionne pour
// N'IMPORTE QUEL compte, courant ou non : c'est ce qui permet d'afficher la
// liste sans se connecter à chacun.
function accountSummary(username){
  const elo=accGetFor(username,'elo',0)||0;
  const rank=(typeof vvGetRank==='function')?vvGetRank(elo):{name:'',color:'var(--muted)'};
  // ranked_games / ranked_wins comptent depuis toujours. On retombe sur
  // l'historique (30 dernières parties) pour les comptes créés avant ces deux
  // clés : c'est faux à la baisse, mais c'est mieux qu'un zéro sur un compte
  // qui a réellement joué.
  const history=accGetFor(username,'match_history',[])||[];
  const games=accGetFor(username,'ranked_games',history.length)||0;
  const wins=accGetFor(username,'ranked_wins',
    history.filter(h=>h&&h.result==='win').length)||0;
  const pearls=accGetFor(username,'pearls',0)||0;
  const rankMaxIdx=accGetFor(username,'rank_max',0)||0;
  const rankMax=(typeof RANKS!=='undefined'&&RANKS[rankMaxIdx])?RANKS[rankMaxIdx]:rank;
  return{username,elo,rank,games,wins,pearls,rankMax};
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
  const stats=[
    {k:'Parties classées',v:s.games},
    {k:'Victoires',       v:s.wins},
    {k:'Perles',          v:s.pearls},
    {k:'Meilleur rang',   v:escH(s.rankMax.name||'—')},
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
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="acc-stats">'+
      stats.map(x=>'<div class="acc-stat"><div class="acc-stat-v">'+x.v+'</div><div class="acc-stat-k">'+x.k+'</div></div>').join('')+
    '</div>'+
    // « Quitter ce compte » : le bouton que cherche quelqu'un qui veut se
    // déconnecter. Discret (btn-ghost) et sous les chiffres : ce n'est pas
    // l'action pour laquelle on vient ici, mais elle doit se trouver du
    // premier coup d'oeil quand on la cherche.
    '<button class="btn btn-ghost acc-logout" id="acc-logout">Quitter ce compte</button>'+
  '</section>';
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
    '<p class="acc-hint">Un compte neuf repart de zéro : aucune créature, aucune perle, '+
      '0 ELO. Le compte actuel est conservé et reste accessible depuis cette page.</p>'+
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
    const err=accountRename(v);
    if(err){
      _accRenaming=true;_accRenameDraft=v;
      showNotif(err,'err');renderAccountPage();
      document.getElementById('acc-rename-input')?.focus();
      return;
    }
    _accRenameDraft=null;
    showNotif('Compte renommé.','ok');
    renderAccountPage();
  };
  host.querySelector('#acc-rename-ok')?.addEventListener('click',doRename);
  host.querySelector('#acc-rename-input')?.addEventListener('keydown',e=>{
    if(e.key==='Enter')doRename();
    if(e.key==='Escape'){_accRenaming=false;_accRenameDraft=null;renderAccountPage();}
  });

  host.querySelector('#acc-logout')?.addEventListener('click',()=>{
    if(accountBusy())return;
    // On annonce OÙ le bouton emmène avant de cliquer : sur le compte
    // précédent, ou sur un compte tout neuf s'il n'y en a pas d'autre.
    const cible=accountLogoutTarget();
    showConfirmModal(
      cible
        ? 'Quitter « '+CUR_ACC+' » et reprendre « '+cible+' » ? Le compte '+CUR_ACC+' est conservé.'
        : 'Quitter « '+CUR_ACC+' » ? C\'est votre seul compte : un nouveau compte vide sera créé, '+
          'et vous pourrez revenir sur celui-ci quand vous voudrez.',
      ()=>{const err=accountLogout();if(err)showNotif(err,'err');},
      {okLabel:'Quitter',okClass:'btn-primary'});
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
        const e2=accountCreate(v);
        if(e2)showNotif(e2,'err');
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

function accountAskSwitch(username){
  if(!username||accountBusy())return;
  const s=accountSummary(username);
  showConfirmModal(
    'Passer sur le compte « '+username+' » ('+s.rank.name+' · '+s.elo+' ELO) ? '+
    'Le compte '+CUR_ACC+' est conservé, vous pourrez y revenir.',
    ()=>accountSwitch(username),
    {okLabel:'Changer de compte',okClass:'btn-primary'});
}

function accountAskDelete(username){
  if(!username)return;
  const s=accountSummary(username);
  showConfirmModal(
    'Supprimer définitivement « '+username+' » ? Ses '+s.games+' parties classées, '+
    'ses créatures et ses '+s.pearls+' perles seront perdues. Cette action est irréversible.',
    ()=>{
      accountDelete(username);
      showNotif('Compte « '+username+' » supprimé.','ok');
      renderAccountPage();
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
