// ================================================================
// TUTORIAL.JS : le savant fou fait visiter son laboratoire
// ================================================================
// Le jeu expliquait ses règles dans un parchemin de bienvenue : un mur de
// texte, lu une fois, oublié aussitôt, et qui ne montrait rien. Or ce jeu a
// trois systèmes qu'aucun joueur d'échecs ne peut deviner (la composition
// d'armée, la possession des pièces, les coffres), et une navigation par cube
// qu'il faut avoir vu tourner une fois.
//
// Le tutoriel remplace ce parchemin par une visite guidée : le savant parle,
// et le joueur AGIT. Les étapes marquées `click` attendent un vrai clic sur
// le vrai bouton, pas sur une reproduction : à la fin, le joueur a réellement
// tourné le cube, composé une armée et ouvert sa Réserve.
//
// PRINCIPES DE ROBUSTESSE, parce qu'un tutoriel cassé est pire que pas de
// tutoriel :
//   - une étape dont la cible est absente devient une simple étape « Suivant »
//     au lieu de bloquer ;
//   - « Quitter » est disponible en permanence, et une étape en attente de
//     clic finit toujours par proposer de passer ;
//   - le projecteur ne capte aucun clic (pointer-events:none), le joueur peut
//     donc toujours cliquer ailleurs et sortir du chemin prévu.
//
// Dépendances : main.js (escH), accounts.js (accGet/accSet), piece-art.js
// (pieceIcon) pour illustrer certaines répliques.
// Lancé par : voie.js (après le choix de la Primordiale, pour un compte
// neuf) et settings-admin.js (bouton « Revoir le tutoriel »).
// ================================================================

// ----------------------------------------------------------------
// LE SAVANT
// ----------------------------------------------------------------
// Dessiné dans le même système que les pièces (js/piece-art.js) : classes
// .b / .l / .k, deux couleurs, donc il suit le thème clair comme sombre.
const SAVANT_SVG=
  '<svg class="pc-svg pc-n" viewBox="0 0 100 100" aria-hidden="true">'+
    // Cheveux hirsutes, dessinés AVANT le crâne pour dépasser derrière.
    '<path class="b" d="M22 44 12 26l14 6-4-20 14 12 4-16 10 13 8-13 5 17 13-9-5 18 14-4-12 17z"/>'+
    // Crâne et mâchoire
    '<path class="b" d="M50 22c15 0 25 11 25 26 0 16-11 28-25 28S25 64 25 48c0-15 10-26 25-26z"/>'+
    // Lunettes de protection relevées sur le front
    '<path class="l" d="M28 42h44"/>'+
    '<circle class="b" cx="39" cy="45" r="10"/><circle class="b" cx="61" cy="45" r="10"/>'+
    '<path class="l" d="M49 45h3"/>'+
    '<circle class="k" cx="39" cy="45" r="3.4"/><circle class="k" cx="61" cy="45" r="3.4"/>'+
    // Sourire de quelqu'un qui vient de réussir un mélange qu'il ne maîtrise pas
    '<path class="l" d="M38 62c6 7 18 7 24 0"/>'+
    // Col de blouse
    '<path class="b" d="M28 84c4-8 10-12 22-12s18 4 22 12l3 12H25z"/>'+
  '</svg>';

// ----------------------------------------------------------------
// ÉTAPES
// ----------------------------------------------------------------
// Chaque étape :
//   text     réplique du savant (HTML autorisé, écrit ici, jamais saisi)
//   at       sélecteur de l'élément à mettre en lumière (facultatif)
//   click    sélecteur à cliquer pour avancer ; sinon bouton « Suivant »
//   wait     ms d'attente après le clic, le temps qu'une animation finisse
//   before   fonction exécutée à l'entrée dans l'étape
//   skipIf   fonction : si elle renvoie vrai, l'étape est sautée
const TUTO_STEPS=[
  {
    text:'Ah&nbsp;! Vous voilà enfin. Ne touchez à rien, tout ici est instable.<br>'+
         'Je suis celui qui a mélangé un jeu d\'échecs avec des créatures. Ça a… fonctionné.',
  },
  {
    text:'La règle qui change tout&nbsp;: personne ne reçoit la même armée. '+
         'Vous allez composer la vôtre, pièce par pièce. Suivez-moi.',
  },
  {
    text:'Ce laboratoire est un cube. Chaque face est une salle.<br>'+
         '<strong>Cliquez la flèche de droite</strong> pour aller à vos armées.',
    at:'#cube-arrow-right',click:'#cube-arrow-right',wait:700,
  },
  {
    text:'Voici votre armurerie. Elle est vide, forcément, vous venez d\'arriver.<br>'+
         '<strong>Créez votre première armée.</strong>',
    at:'#ar-new',click:'#ar-new',wait:700,
  },
  {
    text:'Cinq pièces, pas une de plus&nbsp;: un <strong>Monarque</strong> (perdez-le, '+
         'vous perdez la partie), un <strong>Général</strong>, et trois créatures.<br>'+
         'Le tout dans <strong>24 points</strong>. Une créature puissante vous en laisse '+
         'peu pour les autres&nbsp;: c\'est là qu\'est le vrai jeu.',
    at:'.army-box',
  },
  {
    text:'Chaque créature a son déplacement ET son pouvoir. La Méduse paralyse ses '+
         'voisines en diagonale, le Typhon rase tout autour de lui en arrivant…<br>'+
         '<strong>Clic droit sur n\'importe quelle carte</strong> pour lire sa fiche complète.',
    at:'#cards-container .class-sec',
  },
  {
    text:'Ce petit nombre en haut de chaque carte, c\'est le plus important de tout&nbsp;: '+
         'le nombre d\'<strong>exemplaires que vous possédez</strong>. On ne joue que ce '+
         'qu\'on possède. J\'y reviens, c\'est mon invention préférée.',
    at:'.piece-card .pc-stock',
  },
  {
    text:'Je suis pressé et vous aussi. <strong>Prenez une armée au hasard</strong>, '+
         'vous l\'affinerez plus tard.',
    at:'#b-random',click:'#b-random',wait:450,
  },
  {
    text:'Parfait. <strong>Validez</strong>, et elle rejoint votre armurerie.',
    at:'#b-validate',click:'#b-validate',wait:750,
  },
  {
    text:'Elle est à vous. Maintenant, la partie que les gens comprennent toujours '+
         'trop tard. <strong>Tournez encore à droite.</strong>',
    at:'#cube-arrow-right',click:'#cube-arrow-right',wait:700,
  },
  {
    text:'La Réserve. Tout ce que vous possédez est là, en exemplaires comptés.<br>'+
         'Engager une créature dans une partie, c\'est la <strong>risquer</strong>. '+
         'Vous perdez&nbsp;? Toute l\'armée engagée y reste. Vous gagnez&nbsp;? '+
         'Vous ne perdez que ce qui a été mangé.',
    at:'#rs-inv',
  },
  {
    text:'Rassurez-vous, je ne suis pas un monstre. Chaque jour, ce coffre vous rend '+
         '<strong>4 exemplaires de chacune</strong> de vos pièces. Vous ne pourrez jamais '+
         'vous retrouver bloqué sans armée.',
    at:'#rs-daily',
  },
  {
    text:'Et voici la récompense. Une victoire&nbsp;: un Coffre Pion. Deux d\'affilée&nbsp;: '+
         'un Coffre Cavalier. Puis Fou, Tour, Dame, et <strong>Roi</strong> à partir de six.<br>'+
         'Une seule défaite et la série repart de zéro. C\'est cruel, je sais. C\'est le but.',
    at:'#rs-chests',
  },
  {
    text:'Les plateaux aussi se méritent&nbsp;: bois, puis pierre, acier, argent, et or '+
         'tout en haut. Ils s\'ouvrent en montant dans les rangs.',
    at:'#rs-skins',
  },
  {
    text:'Justement, les rangs. <strong>Encore une face à droite.</strong>',
    at:'#cube-arrow-right',click:'#cube-arrow-right',wait:700,
  },
  {
    text:'La Voie des Victoires. Chaque partie fait bouger votre classement, et chaque '+
         'palier franchi <strong>libère une nouvelle créature</strong> de mes bocaux.',
    at:'.voie-elo-banner',
  },
  {
    text:'Dernier tour, et nous serons revenus au point de départ.',
    at:'#cube-arrow-right',click:'#cube-arrow-right',wait:700,
  },
  {
    text:'<strong>COMBAT</strong> vous envoie contre un autre joueur, quelque part dans le '+
         'monde. C\'est pour ça que le jeu existe.<br>'+
         'Si vous préférez vous échauffer, <strong>l\'Instructeur</strong> est en dessous&nbsp;: '+
         'il ne se retient pas, mais il ne vous en voudra pas.',
    at:'.jouer-actions',
  },
  {
    text:'Une dernière chose, et je vous laisse&nbsp;: en pleine partie, <strong>clic droit '+
         'sur une pièce</strong> vous rappelle son pouvoir. Personne ne les retient tous. '+
         'Moi non plus.<br>Allez. Cassez quelque chose.',
  },
];

// ----------------------------------------------------------------
// MOTEUR
// ----------------------------------------------------------------
let _tutoIdx=-1;
let _tutoCleanup=null;      // retire le guetteur de clic de l'étape en cours
let _tutoTypeTimer=null;
let _tutoReposition=null;
let _tutoEscapeTimer=null;

function tutoDone(){return !!accGet('tuto_done',false);}
function tutoMarkDone(){accSet('tuto_done',true);}

function tutoEls(){
  return{
    root:document.getElementById('tuto-root'),
    spot:document.getElementById('tuto-spot'),
    box:document.getElementById('tuto-box'),
    text:document.getElementById('tuto-text'),
    next:document.getElementById('tuto-next'),
    hint:document.getElementById('tuto-hint'),
  };
}

function tutoStart(){
  const{root}=tutoEls();
  if(!root)return;
  root.classList.add('show');
  document.body.classList.add('tuto-on');
  _tutoIdx=-1;
  tutoNext();
}

function tutoQuit(){
  tutoClearStep();
  const{root,spot}=tutoEls();
  if(root)root.classList.remove('show');
  if(spot)spot.classList.remove('on');
  document.body.classList.remove('tuto-on');
  tutoMarkDone();
  _tutoIdx=-1;
}

function tutoClearStep(){
  if(_tutoCleanup){_tutoCleanup();_tutoCleanup=null;}
  if(_tutoTypeTimer){clearInterval(_tutoTypeTimer);_tutoTypeTimer=null;}
  if(_tutoEscapeTimer){clearTimeout(_tutoEscapeTimer);_tutoEscapeTimer=null;}
  if(_tutoReposition){
    window.removeEventListener('resize',_tutoReposition);
    window.removeEventListener('scroll',_tutoReposition,true);
    _tutoReposition=null;
  }
}

function tutoNext(){
  tutoClearStep();
  _tutoIdx++;
  // Étapes sautées : leur condition n'est plus remplie (par exemple le joueur
  // possédait déjà une armée avant de lancer le tutoriel).
  while(TUTO_STEPS[_tutoIdx]&&TUTO_STEPS[_tutoIdx].skipIf&&TUTO_STEPS[_tutoIdx].skipIf())_tutoIdx++;
  const step=TUTO_STEPS[_tutoIdx];
  if(!step){tutoQuit();return;}
  if(step.before)try{step.before();}catch(e){}
  // Le DOM de l'étape précédente peut encore être en train de se mettre en
  // place (rotation du cube, rendu d'une page) : on laisse passer une frame.
  requestAnimationFrame(()=>tutoRender(step));
}

function tutoRender(step){
  const{box,text,next,hint}=tutoEls();
  if(!box)return;

  const target=step.at?document.querySelector(step.at):null;
  tutoSpotlight(target);
  tutoPlaceBox(target);

  // Une étape qui attend un clic sur une cible absente deviendrait un
  // cul-de-sac : elle retombe sur un simple « Suivant ».
  const clickTarget=step.click?document.querySelector(step.click):null;
  const waitsClick=!!clickTarget;

  tutoType(text,step.text);

  next.style.display=waitsClick?'none':'';
  hint.textContent=waitsClick?'À vous de jouer : cliquez l\'élément mis en lumière.':'';
  hint.style.display=waitsClick?'':'none';

  if(waitsClick){
    const onClick=()=>{
      clickTarget.removeEventListener('click',onClick,true);
      setTimeout(tutoNext,step.wait||300);
    };
    clickTarget.addEventListener('click',onClick,true);
    _tutoCleanup=()=>clickTarget.removeEventListener('click',onClick,true);
    // Filet : après 12 s sans clic, on propose explicitement de continuer,
    // pour ne jamais enfermer quelqu'un qui n'a pas compris quoi cliquer.
    _tutoEscapeTimer=setTimeout(()=>{
      next.textContent='Continuer sans cliquer';
      next.style.display='';
    },12000);
  }else{
    next.textContent='Suivant';
  }
}

// Frappe caractère par caractère : le savant PARLE, il ne dépose pas un pavé.
// Un clic sur la bulle termine la réplique immédiatement.
function tutoType(el,html){
  if(!el)return;
  el.innerHTML=html;
  const full=el.innerHTML;
  // On tape sur le texte visible en laissant les balises intactes : découper
  // du HTML caractère par caractère produirait des balises à moitié écrites.
  const nodes=[];
  const walk=n=>{
    if(n.nodeType===3)nodes.push(n);
    else n.childNodes.forEach(walk);
  };
  walk(el);
  const originals=nodes.map(n=>n.nodeValue);
  nodes.forEach(n=>{n.nodeValue='';});
  let ni=0,ci=0;
  const finish=()=>{
    clearInterval(_tutoTypeTimer);_tutoTypeTimer=null;
    nodes.forEach((n,i)=>{n.nodeValue=originals[i];});
    el.dataset.typing='0';
  };
  el.dataset.typing='1';
  el._tutoFinish=finish;
  _tutoTypeTimer=setInterval(()=>{
    if(ni>=nodes.length){finish();return;}
    const src=originals[ni];
    if(ci>=src.length){ni++;ci=0;return;}
    // Deux caractères par tic : assez vif pour ne pas tester la patience.
    nodes[ni].nodeValue=src.slice(0,ci+2);
    ci+=2;
  },16);
  if(!full)finish();
}

// ----------------------------------------------------------------
// PROJECTEUR
// ----------------------------------------------------------------
// Un trou dans un voile sombre, obtenu par une ombre portée démesurée. Le
// bloc ne capte aucun clic : la cible réelle reste cliquable, et le joueur
// peut toujours cliquer ailleurs.
function tutoSpotlight(target){
  const{spot}=tutoEls();
  if(!spot)return;
  if(!target){spot.classList.remove('on');return;}
  const place=()=>{
    const r=target.getBoundingClientRect();
    if(!r.width&&!r.height){spot.classList.remove('on');return;}
    const pad=10;
    spot.style.left=(r.left-pad)+'px';
    spot.style.top=(r.top-pad)+'px';
    spot.style.width=(r.width+pad*2)+'px';
    spot.style.height=(r.height+pad*2)+'px';
    spot.classList.add('on');
  };
  place();
  // Les faces du cube défilent : le projecteur doit suivre sa cible.
  _tutoReposition=place;
  window.addEventListener('resize',place);
  window.addEventListener('scroll',place,true);
}

// La bulle se met du côté opposé à la cible, pour ne jamais la recouvrir.
function tutoPlaceBox(target){
  const{box}=tutoEls();
  if(!box)return;
  let bottom=true;
  if(target){
    const r=target.getBoundingClientRect();
    bottom=(r.top+r.height/2)<window.innerHeight/2;
  }
  box.classList.toggle('tuto-box-bottom',bottom);
  box.classList.toggle('tuto-box-top',!bottom);
}

// ----------------------------------------------------------------
// BRANCHEMENT
// ----------------------------------------------------------------
// Proposé automatiquement à un compte neuf, une seule fois. Les comptes
// existants le retrouvent dans les réglages : leur imposer une visite guidée
// après coup serait une punition.
function tutoMaybeStart(){
  if(tutoDone())return;
  setTimeout(tutoStart,450);
}

document.addEventListener('DOMContentLoaded',()=>{
  const{next,box,root}=tutoEls();
  if(next)next.addEventListener('click',tutoNext);
  document.getElementById('tuto-quit')?.addEventListener('click',tutoQuit);
  // Cliquer la bulle pendant la frappe affiche la réplique d'un coup.
  if(box)box.addEventListener('click',e=>{
    if(e.target.closest('button'))return;
    const t=document.getElementById('tuto-text');
    if(t&&t.dataset.typing==='1'&&t._tutoFinish)t._tutoFinish();
  });
  if(root){
    const portrait=document.getElementById('tuto-portrait');
    if(portrait)portrait.innerHTML=SAVANT_SVG;
  }
});
