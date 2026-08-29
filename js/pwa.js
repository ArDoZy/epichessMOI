// ================================================================
// PWA.JS : installer le jeu sur l'écran d'accueil
// ================================================================
// LE JEU N'AVAIT AUCUNE RAISON D'ÊTRE REVU DEMAIN. Il vit dans un onglet, et
// un onglet se ferme : le lendemain, il n'existe plus nulle part dans la
// journée du joueur. Une icône sur l'écran d'accueil change cela — c'est le
// levier de rétention le moins intrusif qui existe, et le seul qui ne
// demande pas de serveur.
//
// -- CE QUI DÉCLENCHE LA PROPOSITION -------------------------------------
// Surtout pas l'arrivée. Un bandeau « installez-nous » sur le premier écran
// est le meilleur moyen de se faire fermer : le visiteur n'a pas encore vu
// le jeu, il n'a aucune raison de l'installer. On attend qu'il ait GAGNÉ
// TROIS PARTIES — à ce moment-là il sait ce qu'il installe, et la proposition
// se lit comme un service plutôt que comme une réclame.
//
// Elle ne se montre qu'UNE fois. Refusée, elle ne revient pas : la ligne
// « Installer le jeu » reste dans les réglages pour qui change d'avis.
//
// -- LE SERVICE WORKER ---------------------------------------------------
// Il est enregistré ici (voir sw.js pour sa stratégie de cache). Sans lui, le
// navigateur ne propose jamais l'installation, et le jeu ne s'ouvre pas hors
// ligne. Il n'est enregistré qu'en HTTPS ou en local : ailleurs, l'API
// n'existe pas, et un échec silencieux vaut mieux qu'une erreur en console.
//
// Dépendances : accounts.js (accGet/accSet), main.js (showNotif).
// Utilisé par : settings-admin.js (la ligne « Installer » du panneau),
// economy.js n'en sait rien — c'est pwaNoteWin() qui est appelée depuis la
// fin de partie.
// ================================================================

const PWA_WINS_BEFORE_PROMPT=3;
const PWA_ASKED_KEY='ec_pwa_asked_v1';

// L'évènement que le navigateur nous tend quand l'installation est possible.
// On le CONSERVE au lieu de le laisser passer : c'est le seul moyen de
// choisir NOUS-MÊMES le moment de la proposition.
let _pwaPrompt=null;

function pwaAvailable(){return !!_pwaPrompt;}
function pwaAlreadyAsked(){
  try{return localStorage.getItem(PWA_ASKED_KEY)==='1';}catch(e){return true;}
}
function pwaMarkAsked(){
  try{localStorage.setItem(PWA_ASKED_KEY,'1');}catch(e){}
}

// Déjà installé : le jeu tourne en mode autonome, il n'y a plus rien à
// proposer. Deux façons de le savoir selon les navigateurs.
function pwaInstalled(){
  try{
    if(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)return true;
    if(navigator.standalone)return true;                 // iOS
  }catch(e){}
  return false;
}

// Ouvre la proposition NATIVE du navigateur. On ne fabrique pas la nôtre :
// celle du système est reconnue, elle inspire confiance, et elle est la
// seule qui installe vraiment.
async function pwaInstall(){
  if(!_pwaPrompt){
    // Sur iOS, l'API n'existe pas : l'installation passe par « Partager →
    // Sur l'écran d'accueil ». On ne peut que l'expliquer.
    if(typeof showNotif==='function')
      showNotif('Sur iPhone : bouton Partager, puis « Sur l\'écran d\'accueil ».','ok');
    return false;
  }
  pwaMarkAsked();
  const p=_pwaPrompt;_pwaPrompt=null;
  try{
    p.prompt();
    const r=await p.userChoice;
    pwaRefreshSettingsRow();
    return r&&r.outcome==='accepted';
  }catch(e){return false;}
}

// Appelée à chaque victoire (js/game-flow.js). Elle ne fait rien 99 fois sur
// 100 : c'est voulu.
function pwaNoteWin(){
  if(pwaInstalled()||pwaAlreadyAsked()||!pwaAvailable())return;
  const n=(typeof accGet==='function')?accGet('pwa_wins',0):0;
  const v=n+1;
  if(typeof accSet==='function')accSet('pwa_wins',v);
  if(v<PWA_WINS_BEFORE_PROMPT)return;
  // On laisse la cérémonie de victoire se terminer : une boîte système par
  // -dessus le coffre qui s'ouvre gâcherait les deux.
  setTimeout(()=>{
    if(!pwaAvailable()||pwaAlreadyAsked())return;
    if(typeof showConfirmModal!=='function'){pwaInstall();return;}
    showConfirmModal(
      'Installer Epic Chess sur votre écran d\'accueil ? Le jeu s\'ouvrira en un tap, '+
      'et même sans connexion.',
      ()=>pwaInstall(),
      {okLabel:'Installer',okClass:'btn-primary',cancelLabel:'Plus tard',
       onNo:()=>pwaMarkAsked()});
  },4200);
}

// La ligne des réglages : elle n'existe que si l'installation est possible.
// Un bouton qui ne fait rien est pire que pas de bouton.
function pwaRefreshSettingsRow(){
  const row=document.getElementById('sp-install-row');
  if(!row)return;
  row.style.display=(pwaAvailable()&&!pwaInstalled())?'':'none';
}

(function(){
  window.addEventListener('beforeinstallprompt',e=>{
    // Sans preventDefault, certains navigateurs affichent leur propre
    // bandeau au moment qui les arrange — c'est-à-dire au pire moment.
    e.preventDefault();
    _pwaPrompt=e;
    pwaRefreshSettingsRow();
  });
  window.addEventListener('appinstalled',()=>{
    _pwaPrompt=null;pwaMarkAsked();pwaRefreshSettingsRow();
    if(typeof showNotif==='function')showNotif('Epic Chess est installé.','ok');
  });

  document.addEventListener('DOMContentLoaded',()=>{
    pwaRefreshSettingsRow();
    document.getElementById('sp-install')?.addEventListener('click',()=>pwaInstall());
  });

  // L'enregistrement attend le chargement complet : le service worker n'a
  // rien d'urgent à faire, et il ne doit pas disputer la bande passante au
  // premier affichage.
  if('serviceWorker' in navigator&&
     (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    });
  }
})();
