// ================================================================
// MENU-AMBIENCE.JS : la grande salle respire
// ================================================================
// Le menu principal est une planche peinte — la nef, les deux cavaliers de
// pierre, les braseros — et rien n'y bougeait à part le médaillon. Deux
// gestes lui donnent de l'air, et aucun ne touche au contenu :
//
//   · DES BRAISES montent des braseros, lentement, entre le décor et le
//     menu (un canvas glissé sous .jouer-menu). Davantage sur les côtés, où
//     sont les feux, presque rien au milieu, où se lit le bouton COMBAT ;
//   · sur ORDINATEUR, LE DÉCOR SUIT LA SOURIS d'une dizaine de pixels, à
//     l'opposé du pointeur : une profondeur de champ à peu de frais. Le
//     téléphone n'a pas de pointeur qui survole, et lui demander le
//     gyroscope demanderait une permission pour un effet de décor.
//
// CE QUE ÇA COÛTE : rien quand on ne regarde pas le menu. La boucle ne
// tourne que si la page « Combat » est la page de devant, hors partie,
// onglet visible, mouvement non réduit et réglage « Effets » allumé — le
// même interrupteur que les effets de combat. Trente images par seconde, quarante
// braises au plus.
//
// Dépendances : aucune obligatoire (fxGetLevel, combat-fx.js, facultatif).
// ================================================================

const MENU_EMBERS_MAX=40;
let _mnCv=null,_mnCx=null,_mnRaf=0,_mnLast=0,_mnAcc=0,_mnFrame=0;
const _mnParts=[];

function menuAmbienceOn(){
  if(typeof document==='undefined'||document.hidden)return false;
  try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return false;}catch(e){}
  if(typeof fxGetLevel==='function'&&fxGetLevel()<=0)return false;
  if(document.body.classList.contains('in-game'))return false;
  const front=document.querySelector('.nav-page[data-page="jouer"]');
  return !!(front&&front.classList.contains('is-front')&&document.body.classList.contains('nav-active')
    &&!document.body.classList.contains('nav-overlay'));
}

function menuAmbienceCanvas(){
  const vp=document.querySelector('.nav-page[data-page="jouer"] .page-viewport');
  if(!vp)return null;
  if(!_mnCv||!_mnCv.isConnected){
    _mnCv=document.createElement('canvas');
    _mnCv.className='menu-embers';
    _mnCv.setAttribute('aria-hidden','true');
    // Juste après le décor (::before) et avant le menu : il passe devant la
    // planche et derrière tout ce qu'on touche.
    vp.insertBefore(_mnCv,vp.firstChild);
    _mnCx=_mnCv.getContext('2d');
  }
  const w=vp.clientWidth,h=vp.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
  if(_mnCv._w!==w||_mnCv._h!==h||_mnCv._d!==dpr){
    _mnCv._w=w;_mnCv._h=h;_mnCv._d=dpr;
    _mnCv.width=Math.max(1,Math.round(w*dpr));_mnCv.height=Math.max(1,Math.round(h*dpr));
    _mnCx.setTransform(dpr,0,0,dpr,0,0);
  }
  return _mnCv;
}

// Un halo de braise, pré-peint une fois.
let _mnSprite=null;
function menuEmberSprite(){
  if(_mnSprite)return _mnSprite;
  const s=document.createElement('canvas');s.width=s.height=32;
  const x=s.getContext('2d'),g=x.createRadialGradient(16,16,0,16,16,16);
  g.addColorStop(0,'rgba(255,246,220,1)');g.addColorStop(.25,'rgba(255,190,100,.9)');
  g.addColorStop(.6,'rgba(255,110,40,.25)');g.addColorStop(1,'rgba(255,90,30,0)');
  x.fillStyle=g;x.fillRect(0,0,32,32);
  return (_mnSprite=s);
}

function menuAmbienceSpawn(w,h){
  // Les feux sont sur les CÔTÉS de la nef : une braise naît trois fois plus
  // souvent dans les deux quarts extérieurs qu'au milieu.
  const side=Math.random()<0.78;
  const x=side?(Math.random()<0.5?Math.random()*0.26:0.74+Math.random()*0.26)*w:(0.3+Math.random()*0.4)*w;
  const ph=Math.random()*6,amp=6+Math.random()*16,x0=x;
  _mnParts.push({x,y:h*(0.55+Math.random()*0.5),vy:-(18+Math.random()*34),s:1.4+Math.random()*2.6,
    a:0.45+Math.random()*0.5,t:0,life:4+Math.random()*4,ph,amp,x0,fl:5+Math.random()*7});
}

function menuAmbienceFrame(now){
  _mnRaf=0;
  if(!menuAmbienceOn()){
    if(_mnCx&&_mnCv)_mnCx.clearRect(0,0,_mnCv._w||0,_mnCv._h||0);
    _mnParts.length=0;
    return;
  }
  _mnRaf=requestAnimationFrame(menuAmbienceFrame);
  if((++_mnFrame)&1)return;                       // trente images par seconde
  const cv=menuAmbienceCanvas();if(!cv)return;
  const dt=Math.min(0.08,Math.max(0,(now-_mnLast)/1000));_mnLast=now;
  const w=cv._w,h=cv._h;
  _mnAcc+=dt*5.5;
  while(_mnAcc>=1){_mnAcc-=1;if(_mnParts.length<MENU_EMBERS_MAX)menuAmbienceSpawn(w,h);}
  const c=_mnCx,spr=menuEmberSprite();
  c.clearRect(0,0,w,h);
  c.globalCompositeOperation='lighter';
  for(let i=_mnParts.length-1;i>=0;i--){
    const p=_mnParts[i];
    p.t+=dt;
    if(p.t>=p.life||p.y<-10){_mnParts.splice(i,1);continue;}
    p.y+=p.vy*dt;
    p.x=p.x0+Math.sin(p.t*0.8+p.ph)*p.amp;
    const u=p.t/p.life;
    const a=p.a*Math.min(1,u*4)*(1-u)*(0.7+0.3*Math.sin(p.t*p.fl+p.ph));
    if(a<=0.01)continue;
    c.globalAlpha=a;
    const s=p.s*3;
    c.drawImage(spr,p.x-s,p.y-s,s*2,s*2);
  }
  c.globalAlpha=1;c.globalCompositeOperation='source-over';
}

function menuAmbienceWake(){
  if(_mnRaf||!menuAmbienceOn())return;
  _mnLast=performance.now();
  _mnRaf=requestAnimationFrame(menuAmbienceFrame);
}

// LA PARALLAXE (ordinateur seulement, body.desk). Le pointeur pose deux
// variables sur la page ; le décor (.page-viewport::before, [MENU-AMBIENCE]
// dans css/style.css) les lit avec une transition — c'est la transition qui
// fait l'inertie, et le JS n'a rien à animer.
function menuParallaxWire(){
  const page=document.querySelector('.nav-page[data-page="jouer"]');
  if(!page||page._plx)return;
  page._plx=true;
  let raf=0,px=0,py=0;
  page.addEventListener('pointermove',e=>{
    if(!document.body.classList.contains('desk')||e.pointerType!=='mouse')return;
    const r=page.getBoundingClientRect();
    px=((e.clientX-r.left)/r.width-0.5)*2;py=((e.clientY-r.top)/r.height-0.5)*2;
    if(raf)return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      page.style.setProperty('--plx-x',Math.max(-1,Math.min(1,px)).toFixed(3));
      page.style.setProperty('--plx-y',Math.max(-1,Math.min(1,py)).toFixed(3));
    });
  });
  page.addEventListener('pointerleave',()=>{
    page.style.setProperty('--plx-x','0');page.style.setProperty('--plx-y','0');
  });
}

// On regarde s'il faut rallumer quand la page de devant change (markFront,
// js/pages-nav.js — c'est aussi elle qui dit l'entrée et la sortie d'une
// partie), quand l'interrupteur « Effets » bouge (fxSetLevel,
// js/combat-fx.js) et quand l'onglet revient. Il y avait ici un battement
// de 1,5 s qui tournait pour toujours, partie comprise, pour rattraper ces
// trois cas à l'aveugle.
if(typeof window!=='undefined'){
  document.addEventListener('visibilitychange',menuAmbienceWake);
  window.addEventListener('load',()=>{menuParallaxWire();menuAmbienceWake();});
}
