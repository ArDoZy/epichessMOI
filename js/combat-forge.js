// ================================================================
// COMBAT-FORGE.JS : LA FORGE — le moteur de particules du plateau
// ================================================================
// js/combat-fx.js pose des éléments DOM jetables : un anneau, un noyau,
// neuf éclats. C'est juste, lisible, et ça plafonne vite — quatre-vingt-dix
// nœuds animés, c'est déjà beaucoup pour un téléphone, et une gerbe de
// quatre-vingt-dix étincelles n'est pas encore une explosion.
//
// LA FORGE, C'EST DEUX CANVAS POSÉS DANS LE PLATEAU, et des centaines de
// particules pour le prix de deux éléments. Elle s'ajoute aux effets DOM,
// elle ne les remplace pas : le DOM dit la FORME de l'événement (l'anneau
// de la prise, le vortex du Typhon), la Forge en donne la MATIÈRE (les
// étincelles, les éclats, la poussière, la lumière).
//
// -- CE QU'ELLE MET EN SCÈNE ----------------------------------------------
//   · la PIÈCE PRISE VOLE EN ÉCLATS : son propre dessin, découpé en
//     fragments de verre qui partent dans l'axe du coup, tournent, retombent,
//     les arêtes encore incandescentes ;
//   · l'IMPACT : étincelles projetées dans le cône de l'attaque, éclair,
//     anneau de choc, fumée — tout dimensionné par la valeur de la victime ;
//   · le PLATEAU ENCAISSE : il recule d'un rien dans l'axe du coup, et les
//     cases voisines s'allument en anneaux depuis l'impact (l'onde qui
//     traverse le bois) ;
//   · la VALEUR PRISE monte de la case (« +13 ») — d'or pour une prise, de
//     sang pour une perte ;
//   · la COMÈTE : une tête de lumière qui suit la pièce qui joue, et sème des
//     étincelles à la couleur de sa classe ;
//   · l'ÉCLAIR D'ÉCHEC, qui crépite de la pièce qui menace jusqu'au roi : on
//     voit QUI donne échec, pas seulement que le roi l'est ;
//   · le MAT AU RALENTI : le temps des particules ralentit, le roi se fend,
//     une onde parcourt le plateau entier ;
//   · la VICTOIRE en poussière d'or, la défaite en cendres ;
//   · les GRANDS POUVOIRS : l'aspiration du Typhon, le cri de la Banshee, la
//     poussière de la charge, la colonne de la promotion ;
//   · les BRAISES D'AMBIANCE, qui montent lentement du plateau pendant toute
//     la partie, et s'attisent quand une pendule brûle.
//
// -- DEUX CANVAS, POURQUOI ------------------------------------------------
// Les pièces vivent sur .gc-layer (z-index 2). La comète passe SOUS la pièce
// qui joue — par-dessus, elle cacherait celle qu'on regarde — et les éclats,
// les étincelles et l'éclair passent DEVANT. D'où .fx-forge-under (z 1) et
// .fx-forge-over (z 5), les mêmes étages que les couches DOM de combat-fx.
// Contrairement à elles, un canvas ne fond rien dans le plateau : il dessine
// sa propre lumière (`lighter`), et n'a donc aucune raison de se priver d'un
// z-index.
//
// -- CE QU'ELLE COÛTE ------------------------------------------------------
// Rien quand rien ne brûle : la boucle d'animation s'éteint dès que la
// dernière particule meurt, et ne se rallume qu'au prochain effet. Les
// braises d'ambiance, seules, tournent à demi-cadence. Un plafond
// (FORGE_MAX) borne tout, et chaque émission est proportionnelle au réglage
// « Effets » — éteint, la Forge ne pose plus un seul pixel.
//
// -- LES INTERRUPTEURS -----------------------------------------------------
// Ce sont ceux de combat-fx.js, et rien d'autre : fxOn() (mouvement réduit,
// réglage « Effets », onglet caché). La Forge n'a pas d'avis à part.
//
// Dépendances : combat-fx.js (fxOn, fxCenter, fxForce, fxLastMove,
// _fxFlipped, _fxLevel), data-pieces.js (PIECES).
// Appelée par : combat-fx.js (fxPlayMove, fxPower, fxCharge, fxPromote,
// fxMate), game-render.js (forgeShatter, forgeWarm, forgeCheck,
// forgeTouch). Tout appel extérieur passe par `typeof …==='function'` : le
// jeu reste entier sans ce fichier.
// Banc d'essai : tools/combat-fx-preview.html.
// ================================================================

const FORGE_MAX=900;              // particules vivantes, au plus
const FORGE_SHATTER_DELAY=150;    // l'instant du contact (cf. FX_HIT_MS)

let _fg=null;                     // {board, under:{cv,ctx}, over:{cv,ctx}, w, h, dpr}
const _fgParts=[];
let _fgRaf=0,_fgLast=0;
let _fgScale=1,_fgSlowUntil=0,_fgSlowTo=1;  // le ralenti
let _fgAmbAcc=0,_fgAmbFrame=0;

function forgeOn(){return (typeof fxOn==='function')&&fxOn();}
function forgeLevel(){return (typeof _fxLevel==='number')?_fxLevel:1;}

// ----------------------------------------------------------------
// LES DEUX CANVAS
// ----------------------------------------------------------------
// Créés à la demande dans #game-board, et recréés si le plateau a été vidé
// (ensureBoardCells refait la grille quand le joueur change de couleur).
function forgeEnsure(){
  const b=document.getElementById('game-board');
  if(!b)return null;
  if(!_fg||_fg.board!==b||!_fg.under.cv.isConnected||!_fg.over.cv.isConnected){
    const mk=cls=>{
      let cv=b.querySelector('canvas.'+cls);
      if(!cv){
        cv=document.createElement('canvas');
        cv.className='fx-forge '+cls;
        cv.setAttribute('aria-hidden','true');
        b.appendChild(cv);
      }
      return {cv,ctx:cv.getContext('2d')};
    };
    _fg={board:b,under:mk('fx-forge-under'),over:mk('fx-forge-over'),w:0,h:0,dpr:1};
  }
  forgeResize();
  return _fg;
}
function forgeResize(){
  const g=_fg;if(!g)return;
  const w=g.board.clientWidth,h=g.board.clientHeight;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  if(w===g.w&&h===g.h&&dpr===g.dpr)return;
  g.w=w;g.h=h;g.dpr=dpr;
  [g.under,g.over].forEach(L=>{
    L.cv.width=Math.max(1,Math.round(w*dpr));L.cv.height=Math.max(1,Math.round(h*dpr));
    L.ctx.setTransform(dpr,0,0,dpr,0,0);
  });
}
// L'échelle du monde : toutes les vitesses et les tailles sont écrites pour
// un plateau de 400 px et suivent la taille réelle. Sans cela, une gerbe
// réglée sur ordinateur déborderait d'un téléphone et s'y verrait à peine.
function forgeS(){return _fg?Math.max(0.5,_fg.w/400):1;}
function forgeCell(){return _fg?_fg.w/8:50;}

// Centre d'une case, en pixels du canvas (l'orientation vient de
// combat-fx.js, qui la reçoit de renderGame).
function forgeXY(r,c){
  const p=(typeof fxCenter==='function')?fxCenter(r,c):{x:(c+.5)*12.5,y:(r+.5)*12.5};
  return {x:p.x/100*_fg.w,y:p.y/100*_fg.h};
}
// Une direction de plateau (dr, dc) en direction d'écran, unitaire.
function forgeDir(from,to){
  if(!from||!to)return null;
  const a=forgeXY(from.r,from.c),b=forgeXY(to.r,to.c);
  const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy);
  return l>0.5?{x:dx/l,y:dy/l}:null;
}

// ----------------------------------------------------------------
// LES COULEURS
// ----------------------------------------------------------------
// Les classes ont leur couleur dans la palette CSS (--sorcier, --brute…) :
// on la relit une fois, résolue, plutôt que de la recopier ici.
const FORGE_CLASS_VAR={Monarque:'--monarque','Général':'--general',Primordiale:'--primordiale',Sorcier:'--sorcier',Brute:'--brute'};
const _fgColorCache=new Map();
function forgeRGB(css){
  if(_fgColorCache.has(css))return _fgColorCache.get(css);
  let s=css;
  if(/^var\(/.test(s)||/^--/.test(s)){
    const name=s.replace(/^var\(|\)$/g,'').trim();
    s=getComputedStyle(document.body).getPropertyValue(name).trim()||'#f0d189';
  }
  const cx=forgeRGB._cx||(forgeRGB._cx=document.createElement('canvas').getContext('2d'));
  cx.fillStyle='#000';cx.fillStyle=s;
  const v=cx.fillStyle;let rgb=[240,209,137];
  if(v[0]==='#'){const n=parseInt(v.slice(1),16);rgb=[(n>>16)&255,(n>>8)&255,n&255];}
  else{const m=v.match(/[\d.]+/g);if(m)rgb=[+m[0],+m[1],+m[2]];}
  _fgColorCache.set(css,rgb);
  return rgb;
}
function forgePieceRGB(pieceId){
  if(typeof PIECES!=='undefined'&&pieceId){
    const p=PIECES.find(x=>x.id===pieceId);
    if(p&&FORGE_CLASS_VAR[p.class])return forgeRGB(FORGE_CLASS_VAR[p.class]);
  }
  return forgeRGB('--gold2');
}
const FORGE_GOLD=[255,214,128],FORGE_HOT=[255,236,200],FORGE_EMBER=[255,128,60],FORGE_BLOOD=[255,92,72];
// Un mélange vers le blanc : le cœur d'une étincelle est toujours plus clair
// que sa couleur.
function forgeMix(a,b,t){return [a[0]+(b[0]-a[0])*t|0,a[1]+(b[1]-a[1])*t|0,a[2]+(b[2]-a[2])*t|0];}

// LE HALO, PRÉ-PEINT. Un dégradé radial recalculé à chaque particule et à
// chaque image coûterait plus que tout le reste de la Forge : il est peint
// une fois par couleur dans un petit canvas, puis simplement estampillé.
const _fgGlow=new Map();
function forgeGlow(rgb){
  const k=rgb.join(',');
  let s=_fgGlow.get(k);
  if(s)return s;
  s=document.createElement('canvas');s.width=s.height=64;
  const x=s.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
  // LE BORD SOMBRE N'EST PAS UNE FAUTE DE GOÛT. Un canvas ne se fond pas au
  // plateau : il s'y POSE. Une braise claire posée sur le bois clair d'une
  // case blanche n'existe plus — même couleur, même lumière. Le halo garde
  // donc une couronne brûlée, de la couleur assombrie : invisible sur une
  // case sombre, elle détoure la lumière sur une case claire.
  const dk=rgb.map(v=>Math.round(v*0.32)).join(',');
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(.2,'rgba('+k+',.95)');
  g.addColorStop(.48,'rgba('+k+',.42)');
  g.addColorStop(.72,'rgba('+dk+',.22)');
  g.addColorStop(1,'rgba('+dk+',0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);
  _fgGlow.set(k,s);
  return s;
}
let _fgSmoke=null;
function forgeSmokeSprite(){
  if(_fgSmoke)return _fgSmoke;
  const s=document.createElement('canvas');s.width=s.height=64;
  const x=s.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(24,20,18,.55)');g.addColorStop(.6,'rgba(24,20,18,.22)');g.addColorStop(1,'rgba(24,20,18,0)');
  x.fillStyle=g;x.fillRect(0,0,64,64);
  return (_fgSmoke=s);
}

// ----------------------------------------------------------------
// LES PARTICULES
// ----------------------------------------------------------------
// Un seul tableau, des objets nus. Champs communs :
//   k   genre (spark, glow, ember, smoke, ring, shard, bolt, text, crack,
//       comet, amb)
//   l   étage : 0 sous les pièces, 1 devant
//   x,y position · vx,vy vitesse (px/s) · g gravité · dr freinage
//   t   âge · life durée (s) · d retard avant naissance (s)
function forgeAdd(p){
  if(_fgParts.length>=FORGE_MAX)return null;
  p.t=0;p.d=p.d||0;p.l=(p.l===0)?0:1;
  _fgParts.push(p);
  forgeWake();
  return p;
}
function forgeWake(){
  if(_fgRaf||_fgManual)return;
  _fgLast=performance.now();
  _fgRaf=requestAnimationFrame(forgeFrame);
}

// LE PAS À PAS. Le banc d'essai (tools/combat-fx-preview.html), le test de
// fumée et l'outil de captures ont besoin d'une image EXACTE à 200 ms d'une
// prise — une capture d'écran prend elle-même cent millisecondes, et la
// boucle aurait filé pendant ce temps. En mode manuel la boucle ne tourne
// plus seule : forgeAdvance(ms) fait avancer le temps des particules par pas
// de 16 ms, et peint. Le jeu ne s'en sert jamais.
let _fgManual=false;
function forgeManual(on){
  _fgManual=!!on;
  if(_fgManual&&_fgRaf){cancelAnimationFrame(_fgRaf);_fgRaf=0;}
  if(!_fgManual&&_fgParts.length)forgeWake();
}
function forgeAdvance(ms){
  let left=ms;
  while(left>0){const d=Math.min(16,left);left-=d;forgeStep(d/1000,performance.now());}
}
function forgeStats(){
  const k={};_fgParts.forEach(p=>{k[p.k]=(k[p.k]||0)+1;});return k;
}
function forgeClear(){
  _fgParts.length=0;
  if(_fg)[_fg.under,_fg.over].forEach(L=>L.ctx.clearRect(0,0,_fg.w,_fg.h));
}
// Le ralenti : le temps des particules descend à `to` pendant `ms`, puis
// remonte en douceur. Il ne touche QUE la Forge — la partie, la pendule et
// les transitions CSS ne ralentissent jamais.
function forgeSlow(to,ms){
  _fgSlowTo=Math.min(_fgSlowTo<1&&performance.now()<_fgSlowUntil?_fgSlowTo:1,to);
  _fgSlowUntil=Math.max(_fgSlowUntil,performance.now()+ms);
}

function forgeFrame(now){
  _fgRaf=0;
  if(_fgManual)return;
  const dt=Math.min(0.05,Math.max(0,(now-_fgLast)/1000));_fgLast=now;
  if(forgeStep(dt,now))_fgRaf=requestAnimationFrame(forgeFrame);
}

// UN PAS DE TEMPS : mise à jour et peinture. Renvoie vrai s'il faut une
// image de plus.
function forgeStep(dt,now){
  const g=_fg;
  if(!g||!g.board.isConnected||!forgeOn()){forgeClear();return false;}
  forgeResize();
  const target=now<_fgSlowUntil?_fgSlowTo:1;
  _fgScale+=(target-_fgScale)*(target<_fgScale?0.5:0.08);
  if(now>=_fgSlowUntil)_fgSlowTo=1;
  dt*=_fgScale;
  const amb=forgeAmbientTick(dt);
  // Les braises seules tournent à demi-cadence : elles montent de quelques
  // pixels par seconde, trente images suffisent, et la batterie le sait.
  const onlyAmb=_fgParts.every(p=>p.k==='amb');
  if(onlyAmb&&!_fgManual&&(++_fgAmbFrame&1))return !!(_fgParts.length||amb);
  const U=g.under.ctx,O=g.over.ctx;
  U.clearRect(0,0,g.w,g.h);O.clearRect(0,0,g.w,g.h);
  for(let i=_fgParts.length-1;i>=0;i--){
    const p=_fgParts[i];
    if(p.d>0){p.d-=dt;if(p.d>0)continue;if(p.born)p.born(p);}
    p.t+=dt;
    if(p.t>=p.life){_fgParts.splice(i,1);continue;}
    if(p.up)p.up(p,dt);
    else{
      if(p.dr){const f=Math.exp(-p.dr*dt);p.vx*=f;p.vy*=f;}
      p.vy+=(p.g||0)*dt;
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.vr)p.rot+=p.vr*dt;
    }
    forgeDraw(p.l?O:U,p);
  }
  return !!(_fgParts.length||amb);
}

function forgeDraw(c,p){
  const u=p.t/p.life;                       // 0 → 1
  switch(p.k){
    case 'spark':{
      // Un trait le long de la vitesse : c'est la traînée qui fait la
      // vitesse, un point ne dit jamais qu'il file.
      const a=(1-u)*(p.a||1);
      const len=Math.min(p.len||18,Math.hypot(p.vx,p.vy)*0.035)+1;
      const v=Math.hypot(p.vx,p.vy)||1;
      const x0=p.x-p.vx/v*len,y0=p.y-p.vy/v*len,lw=p.w*(1-u*0.6);
      c.lineCap='round';
      // Le même détourage que les halos (voir forgeGlow) : une traînée sombre
      // et large sous le trait, pour que l'étincelle se lise sur le bois clair.
      c.strokeStyle='rgba('+(p.c[0]*0.3|0)+','+(p.c[1]*0.2|0)+','+(p.c[2]*0.15|0)+','+(a*0.42).toFixed(3)+')';
      c.lineWidth=lw*2.6;
      c.beginPath();c.moveTo(x0,y0);c.lineTo(p.x,p.y);c.stroke();
      c.globalCompositeOperation='lighter';
      c.strokeStyle='rgba('+p.c[0]+','+p.c[1]+','+p.c[2]+','+a.toFixed(3)+')';
      c.lineWidth=lw;
      c.beginPath();c.moveTo(x0,y0);c.lineTo(p.x,p.y);c.stroke();
      if(p.head){c.globalAlpha=a*0.7;const s=p.w*3.2;c.drawImage(forgeGlow(p.c),p.x-s,p.y-s,s*2,s*2);c.globalAlpha=1;}
      c.globalCompositeOperation='source-over';
      break;
    }
    case 'glow':case 'ember':case 'amb':{
      let a=p.a||1;
      if(p.k==='glow')a*=1-u*u;
      else a*=Math.min(1,u*5)*(1-u)*(p.k==='amb'?1:1.3);
      if(p.fl)a*=0.65+0.35*Math.sin(p.t*p.fl+p.ph);
      const s=p.s*(p.s1!=null?(1+(p.s1-1)*u):1);
      if(a<=0.003||s<=0.1)break;
      // Les éclairs (glow) s'additionnent entre eux ; les braises se POSENT,
      // pour que leur couronne sombre détoure la lumière (voir forgeGlow).
      if(p.k==='glow')c.globalCompositeOperation='lighter';
      c.globalAlpha=Math.min(1,a);
      c.drawImage(forgeGlow(p.c),p.x-s,p.y-s,s*2,s*2);
      c.globalAlpha=1;c.globalCompositeOperation='source-over';
      break;
    }
    case 'smoke':{
      const s=p.s*(1+(p.s1-1)*u);
      c.globalAlpha=(p.a||.7)*(1-u)*Math.min(1,u*6);
      c.drawImage(forgeSmokeSprite(),p.x-s,p.y-s,s*2,s*2);
      c.globalAlpha=1;
      break;
    }
    case 'ring':{
      const e=1-Math.pow(1-u,3);
      const r=p.r0+(p.r1-p.r0)*e;
      c.globalCompositeOperation='lighter';
      c.strokeStyle='rgba('+p.c[0]+','+p.c[1]+','+p.c[2]+','+((1-u)*(p.a||.9)).toFixed(3)+')';
      c.lineWidth=Math.max(0.5,p.w*(1-u));
      c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.stroke();
      c.globalCompositeOperation='source-over';
      break;
    }
    case 'shard':forgeDrawShard(c,p,u);break;
    case 'bolt':forgeDrawBolt(c,p,u);break;
    case 'crack':forgeDrawCrack(c,p,u);break;
    case 'text':{
      const pop=u<0.18?(0.6+u/0.18*0.55):(1.15-Math.min(0.15,(u-0.18)*0.6));
      c.save();
      c.translate(p.x,p.y);c.scale(pop,pop);
      c.globalAlpha=u>0.65?(1-u)/0.35:1;
      c.font='900 '+p.size+'px "Cinzel","Cinzel Decorative",Georgia,serif';
      c.textAlign='center';c.textBaseline='middle';
      c.lineWidth=p.size*0.22;c.strokeStyle='rgba(20,10,4,.85)';c.lineJoin='round';
      c.strokeText(p.txt,0,0);
      c.fillStyle='rgb('+p.c.join(',')+')';c.fillText(p.txt,0,0);
      c.restore();
      break;
    }
    case 'comet':{
      const s=p.s*(1-u*0.4);
      c.globalCompositeOperation='lighter';c.globalAlpha=0.9*(1-u*0.5);
      c.drawImage(forgeGlow(p.c),p.x-s,p.y-s,s*2,s*2);
      c.globalAlpha=1;c.globalCompositeOperation='source-over';
      break;
    }
  }
}

// ----------------------------------------------------------------
// LA PIÈCE QUI VOLE EN ÉCLATS
// ----------------------------------------------------------------
// LE DESSIN DE LA PIÈCE EST UNE IMAGE QU'ON DÉCOUPE. Son SVG du plateau est
// sérialisé — avec les deux couleurs du camp résolues, car une image ne voit
// pas les variables CSS du document — puis chargé comme image et rangé dans
// un cache : une capture n'attend jamais un chargement, la pièce a été
// « chauffée » à sa naissance (forgeWarm, appelée par syncPieces).
const _fgArt=new Map();
function forgeArtKey(svg,pid){
  const cs=getComputedStyle(svg);
  return {fill:cs.getPropertyValue('--pc-fill').trim()||'#f6f1e6',
          line:cs.getPropertyValue('--pc-line').trim()||'#1b1512',pid:pid||''};
}
function forgeArtImage(svg,pid){
  if(!svg)return null;
  const k=forgeArtKey(svg,pid);
  const key=k.pid+'|'+k.fill+'|'+k.line+'|'+svg.childElementCount;
  let e=_fgArt.get(key);
  if(e)return e;
  try{
    const clone=svg.cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    clone.setAttribute('width','200');clone.setAttribute('height','200');
    clone.removeAttribute('class');
    const st=document.createElementNS('http://www.w3.org/2000/svg','style');
    st.textContent='.b{fill:'+k.fill+';stroke:'+k.line+';stroke-width:3.4;stroke-linejoin:round;stroke-linecap:round}'+
      '.l{fill:none;stroke:'+k.line+';stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}.k{fill:'+k.line+'}';
    clone.insertBefore(st,clone.firstChild);
    const img=new Image();
    img.decoding='async';
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(clone));
    e={img,fill:forgeRGB(k.fill),line:forgeRGB(k.line)};
    _fgArt.set(key,e);
    if(_fgArt.size>160)_fgArt.delete(_fgArt.keys().next().value);
  }catch(err){e=null;}
  return e;
}
function forgeWarm(node){
  if(!node||!forgeOn())return;
  const svg=node.querySelector('.gc-art svg');
  if(svg)forgeArtImage(svg,node._pid);
}

// LE DÉCOUPAGE : un éclatement en étoile autour du point d'impact, puis
// chaque rayon coupé en deux à distance variable. C'est ainsi que casse un
// verre ou une plaque de marbre frappée — et non en carrés réguliers, qui
// se liraient comme une mosaïque qui s'effondre.
function forgeShardPolys(ix,iy,n){
  const angs=[];
  for(let i=0;i<n;i++)angs.push((i+Math.random()*0.7)/n*Math.PI*2);
  angs.sort((a,b)=>a-b);
  // Le point où un rayon issu de (ix,iy) sort du carré 0..100.
  const exit=a=>{
    const dx=Math.cos(a),dy=Math.sin(a);
    let t=1e9;
    if(dx>1e-6)t=Math.min(t,(100-ix)/dx);else if(dx<-1e-6)t=Math.min(t,(0-ix)/dx);
    if(dy>1e-6)t=Math.min(t,(100-iy)/dy);else if(dy<-1e-6)t=Math.min(t,(0-iy)/dy);
    return [ix+dx*t,iy+dy*t];
  };
  const corners=[[100,100,Math.atan2(100-iy,100-ix)],[0,100,Math.atan2(100-iy,-ix)],
                 [0,0,Math.atan2(-iy,-ix)],[100,0,Math.atan2(-iy,100-ix)]]
    .map(k=>[k[0],k[1],(k[2]+Math.PI*2)%(Math.PI*2)]);
  const polys=[];
  for(let i=0;i<n;i++){
    const a0=angs[i],a1=i+1<n?angs[i+1]:angs[0]+Math.PI*2;
    const P0=exit(a0),P1=exit(a1);
    const mid=corners.filter(k=>{let a=k[2];if(a<a0)a+=Math.PI*2;return a>a0&&a<a1;})
      .sort((x,y)=>{let ax=x[2],ay=y[2];if(ax<a0)ax+=Math.PI*2;if(ay<a0)ay+=Math.PI*2;return ax-ay;})
      .map(k=>[k[0],k[1]]);
    const f=0.28+Math.random()*0.32;
    const Q0=[ix+(P0[0]-ix)*f,iy+(P0[1]-iy)*f],Q1=[ix+(P1[0]-ix)*f,iy+(P1[1]-iy)*f];
    polys.push([[ix,iy],Q0,Q1]);
    polys.push([Q0,P0].concat(mid,[P1,Q1]));
  }
  return polys;
}

function forgeShatter(node){
  if(!node||!forgeOn())return false;
  const g=forgeEnsure();if(!g||!g.w)return false;
  const svg=node.querySelector('.gc-art svg');
  if(!svg)return false;
  const r=+node.dataset.r,c=+node.dataset.c;
  if(!isFinite(r)||!isFinite(c))return false;
  const art=forgeArtImage(svg,node._pid);
  const pid=node._pid;
  // L'AXE DU COUP : celui du dernier coup joué, s'il frappe cette case.
  // Sinon (victime collatérale du Typhon, de la charge), un éclatement
  // sans direction, depuis le centre.
  const lm=(typeof fxLastMove==='function')?fxLastMove():null;
  let dir=null,mover=null;
  if(lm&&Date.now()-lm.at<600){
    const at=lm.capAt||lm.to;
    if(at&&at.r===r&&at.c===c){dir=forgeDir(lm.from,lm.to);mover=lm;}
  }
  const victimColor=(svg.classList.contains('pc-b')?'b':svg.classList.contains('pc-w')?'w':null);
  const delay=dir?FORGE_SHATTER_DELAY:30;
  setTimeout(()=>{
    if(!forgeOn())return;
    node.style.visibility='hidden';
    forgeSpawnShards(r,c,art,dir,pid);
    forgeImpact(r,c,pid,dir,victimColor,!!mover);
  },delay);
  return true;
}

function forgeSpawnShards(r,c,art,dir,pid){
  const g=forgeEnsure();if(!g)return;
  const S=forgeS(),cell=forgeCell(),size=cell*0.86,sc=size/100;
  const o=forgeXY(r,c);
  const force=(typeof fxForce==='function')?fxForce(pid):0.5;
  const lv=forgeLevel();
  // Le point d'impact est poussé du côté d'où vient le coup.
  const ix=50-(dir?dir.x*20:0)+(Math.random()-0.5)*10;
  const iy=52-(dir?dir.y*20:0)+(Math.random()-0.5)*10;
  // Peu d'éclats, et gros : le dessin d'une pièce est fait de vide autant
  // que de matière, et un éclat découpé dans le vide est un éclat invisible.
  const n=Math.max(3,Math.round((4+force*3.5)*(0.5+lv*0.5)));
  const polys=forgeShardPolys(ix,iy,n);
  const hot=forgeMix(forgePieceRGB(pid),FORGE_HOT,0.55);
  polys.forEach(poly=>{
    let cx=0,cy=0;poly.forEach(q=>{cx+=q[0];cy+=q[1];});cx/=poly.length;cy/=poly.length;
    const ox=cx-ix,oy=cy-iy,ol=Math.hypot(ox,oy)||1;
    const sp=(70+Math.random()*170)*S*(0.7+force*0.6);
    const push=(dir?(90+Math.random()*120)*S*(0.6+force*0.8):0);
    forgeAdd({k:'shard',l:1,art,poly:poly.map(q=>[q[0]-cx,q[1]-cy]),cx,cy,sc,
      x:o.x+(cx-50)*sc,y:o.y+(cy-50)*sc,
      vx:ox/ol*sp+(dir?dir.x*push:0),vy:oy/ol*sp+(dir?dir.y*push:0)-(120+Math.random()*120)*S,
      g:720*S,dr:1.1,rot:0,vr:(Math.random()-0.5)*(5+force*7),
      life:0.95+Math.random()*0.5,hot});
  });
}
function forgeDrawShard(c,p,u){
  const shrink=1-u*0.25;
  c.save();
  c.translate(p.x,p.y);c.rotate(p.rot);c.scale(p.sc*shrink,p.sc*shrink);
  c.globalAlpha=u>0.55?Math.max(0,(1-u)/0.45):1;
  c.beginPath();
  p.poly.forEach((q,i)=>i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]));
  c.closePath();
  const img=p.art&&p.art.img;
  if(img&&img.complete&&img.naturalWidth){
    c.save();c.clip();c.drawImage(img,-p.cx,-p.cy,100,100);c.restore();
  }else if(p.art){
    c.fillStyle='rgb('+p.art.fill.join(',')+')';c.fill();
    c.strokeStyle='rgb('+p.art.line.join(',')+')';c.lineWidth=3;c.stroke();
  }
  // LES ARÊTES BRÛLENT un instant : la cassure est fraîche, elle luit
  // encore — c'est la même lumière que les fissures d'un coffre qu'on brise.
  if(u<0.32){
    c.globalCompositeOperation='lighter';
    c.strokeStyle='rgba('+p.hot.join(',')+','+(1-u/0.32).toFixed(3)+')';
    c.lineWidth=2.4/Math.max(0.3,p.sc);c.lineJoin='round';c.stroke();
  }
  c.restore();
}

// ----------------------------------------------------------------
// L'IMPACT
// ----------------------------------------------------------------
function forgeImpact(r,c,pid,dir,victimColor,fromMove){
  if(!forgeOn())return;
  const g=forgeEnsure();if(!g)return;
  const S=forgeS(),cell=forgeCell(),lv=forgeLevel();
  const o=forgeXY(r,c);
  const force=(typeof fxForce==='function')?fxForce(pid):0.5;
  const col=forgePieceRGB(pid);
  const hot=forgeMix(col,FORGE_HOT,0.6);
  // LA LUEUR, qui éclaire les cases voisines un dixième de seconde. PAS
  // D'ANNEAU ICI : combat-fx.js pose déjà le sien (.fx-ring), et deux ondes
  // concentriques parties du même point au même instant ne se lisent pas
  // comme un choc plus fort — elles se lisent comme un défaut d'affichage
  // (la leçon de la cinématique d'entrée, [CINEMATIC]).
  forgeAdd({k:'glow',l:1,x:o.x,y:o.y,vx:0,vy:0,s:cell*(0.8+force*1.1),s1:1.5,c:hot,a:.55,life:0.24});
  // LES ÉTINCELLES, dans le cône du coup : soixante-dix pour cent partent
  // dans l'axe de l'attaque, le reste en étoile.
  const n=Math.round((14+force*46)*lv);
  for(let i=0;i<n;i++){
    let a;
    if(dir&&Math.random()<0.7)a=Math.atan2(dir.y,dir.x)+(Math.random()-0.5)*1.5;
    else a=Math.random()*Math.PI*2;
    const sp=(160+Math.random()*520)*S*(0.6+force*0.7);
    forgeAdd({k:'spark',l:1,x:o.x,y:o.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-60*S,g:760*S,dr:2.2,
      w:(1+Math.random()*1.8)*S,len:(10+force*18)*S,c:Math.random()<0.4?FORGE_HOT:forgeMix(col,FORGE_GOLD,Math.random()*0.5),
      head:Math.random()<0.3,life:0.35+Math.random()*0.5});
  }
  // Les braises qui retombent et les motes qui montent.
  const m=Math.round((4+force*10)*lv);
  for(let i=0;i<m;i++){
    const a=Math.random()*Math.PI*2,sp=(30+Math.random()*90)*S;
    forgeAdd({k:'ember',l:1,x:o.x+(Math.random()-0.5)*cell*0.4,y:o.y+(Math.random()-0.5)*cell*0.4,
      vx:Math.cos(a)*sp,vy:-Math.abs(Math.sin(a))*sp-40*S,g:-20*S,dr:1.2,s:(2.5+Math.random()*4)*S,
      c:Math.random()<0.5?FORGE_EMBER:FORGE_GOLD,a:0.9,fl:18,ph:Math.random()*6,life:0.8+Math.random()*0.9});
  }
  // LA FUMÉE : sombre, lente, dessinée sous les pièces pour ne jamais
  // voiler la case d'arrivée.
  for(let i=0;i<Math.round(3+force*4);i++){
    forgeAdd({k:'smoke',l:0,x:o.x+(Math.random()-0.5)*cell*0.5,y:o.y+(Math.random()-0.5)*cell*0.3,
      vx:(Math.random()-0.5)*30*S,vy:-(20+Math.random()*30)*S,dr:0.8,s:cell*0.35,s1:2.4,a:0.55,
      life:0.9+Math.random()*0.6,d:Math.random()*0.08});
  }
  if(fromMove){
    forgeRecoil(dir,force);
    if(force>0.4)forgeRipple(r,c,force);
    if(force>0.82)forgeSlow(0.3,140);
  }
  forgeValue(r,c,pid,victimColor);
}

// LA VALEUR PRISE, qui monte de la case. D'or si c'est le joueur qui prend,
// de sang si c'est lui qui perd : le même chiffre ne raconte pas la même
// histoire des deux côtés du plateau.
function forgePieceValue(pid){
  if(typeof PIECES!=='undefined'){const p=PIECES.find(x=>x.id===pid);if(p&&p.value)return p.value;}
  return 1;
}
function forgeValue(r,c,pid,victimColor){
  if(!pid||!forgeOn())return;
  const S=forgeS(),o=forgeXY(r,c);
  const me=(typeof GS!=='undefined'&&GS&&GS.playerColor)||'w';
  const mine=victimColor&&victimColor!==me;
  const v=forgePieceValue(pid);
  forgeAdd({k:'text',l:1,x:o.x,y:o.y-forgeCell()*0.15,vx:0,vy:-58*S,dr:1.6,
    txt:(mine?'+':'−')+v,size:Math.round((15+Math.min(13,v)*1.3)*S),
    c:mine?[255,221,140]:[255,120,100],life:1.05,d:0.04});
}

// ----------------------------------------------------------------
// LE PLATEAU ENCAISSE
// ----------------------------------------------------------------
// LE RECUL passe par les propriétés INDIVIDUELLES `translate` et `scale`, et
// sur la COLONNE du plateau, jamais sur `transform` ni sur #game-board : la
// secousse de sfx.js anime déjà le `transform` du plateau, et deux
// animations sur la même propriété du même élément se volent la place.
function forgeRecoil(dir,force){
  const g=_fg;if(!g)return;
  const col=g.board.parentElement;
  if(!col||typeof col.animate!=='function')return;
  const k=(2+force*7)*forgeLevel();
  const dx=dir?dir.x*k:0,dy=dir?dir.y*k:k*0.5;
  try{
    col.animate([
      {translate:'0px 0px',scale:'1'},
      {translate:dx.toFixed(1)+'px '+dy.toFixed(1)+'px',scale:String(1+0.014*force),offset:0.16},
      {translate:(-dx*0.25).toFixed(1)+'px '+(-dy*0.25).toFixed(1)+'px',scale:'1',offset:0.5},
      {translate:'0px 0px',scale:'1'},
    ],{duration:300+force*160,easing:'cubic-bezier(.2,.8,.3,1)'});
  }catch(e){}
}
// L'ONDE DANS LE BOIS : les cases voisines s'allument en anneaux, une
// rangée de cases toutes les 45 ms. La case de l'impact elle-même est
// exclue — elle a déjà son éclair (.cap-flash) et une seule animation par
// case est permise.
function forgeRipple(r,c,force,radius){
  const g=_fg;if(!g)return;
  const R=radius||Math.max(1,Math.round(1+force*2.6));
  const cells=g.board.querySelectorAll('.gc');
  const touched=[];
  cells.forEach(el=>{
    const d=Math.max(Math.abs(+el.dataset.r-r),Math.abs(+el.dataset.c-c));
    if(d<1||d>R)return;
    el.style.setProperty('--rip-d',((d-1)*45)+'ms');
    el.style.setProperty('--rip-a',(0.55*(1-(d-1)/R)+0.12).toFixed(2));
    el.classList.remove('gc-ripple');void el.offsetWidth;
    el.classList.add('gc-ripple');
    touched.push(el);
  });
  setTimeout(()=>touched.forEach(el=>el.classList.remove('gc-ripple')),520+R*45);
}

// ----------------------------------------------------------------
// LA COMÈTE : la pièce qui joue sème sa lumière
// ----------------------------------------------------------------
// La tête suit la pièce sur la même horloge que sa transition CSS
// (BOARD_MOVE_MS, js/game-render.js) et passe SOUS elle : on la voit
// déborder autour de la silhouette comme une aura, jamais par-dessus.
function forgeComet(from,to,pid,heavy){
  if(!forgeOn())return;
  const g=forgeEnsure();if(!g)return;
  const a=forgeXY(from.r,from.c),b=forgeXY(to.r,to.c);
  if(Math.hypot(b.x-a.x,b.y-a.y)<2)return;
  const S=forgeS(),cell=forgeCell(),col=forgePieceRGB(pid),lv=forgeLevel();
  const dur=(typeof BOARD_MOVE_MS==='number'?BOARD_MOVE_MS:200)/1000;
  forgeAdd({k:'comet',l:0,x:a.x,y:a.y,vx:0,vy:0,s:cell*(heavy?0.62:0.5),c:forgeMix(col,FORGE_HOT,0.25),life:dur+0.12,
    up:(p,dt)=>{
      const u=Math.min(1,p.t/dur),e=1-Math.pow(1-u,3);
      p.x=a.x+(b.x-a.x)*e;p.y=a.y+(b.y-a.y)*e;
      if(u<1){
        const n=Math.max(1,Math.round((heavy?3:2)*lv));
        for(let i=0;i<n;i++){
          const an=Math.random()*Math.PI*2,sp=(20+Math.random()*60)*S;
          forgeAdd({k:Math.random()<0.6?'ember':'spark',l:0,x:p.x+(Math.random()-0.5)*cell*0.35,y:p.y+(Math.random()-0.5)*cell*0.35,
            vx:Math.cos(an)*sp,vy:Math.sin(an)*sp-15*S,g:-10*S,dr:2,s:(1.8+Math.random()*2.6)*S,w:1.2*S,len:6*S,
            c:Math.random()<0.3?FORGE_HOT:col,a:0.85,life:0.45+Math.random()*0.5});
        }
      }
    }});
}

// ----------------------------------------------------------------
// L'ÉCLAIR D'ÉCHEC
// ----------------------------------------------------------------
// Il crépite de la pièce qui menace jusqu'au roi, et se redessine toutes
// les 45 ms : un trait fixe se lirait comme une flèche d'aide, un trait qui
// grésille se lit comme un danger.
function forgeCheck(king,checkers){
  if(!forgeOn()||!king)return;
  const g=forgeEnsure();if(!g)return;
  const S=forgeS(),k=forgeXY(king.r,king.c),cell=forgeCell();
  (checkers||[]).slice(0,3).forEach((q,i)=>{
    const a=forgeXY(q.r,q.c);
    forgeAdd({k:'bolt',l:1,x:a.x,y:a.y,bx:k.x,by:k.y,vx:0,vy:0,life:0.75,d:i*0.06,S,seg:null,next:0,
      c:[255,96,60]});
    forgeAdd({k:'glow',l:1,x:a.x,y:a.y,vx:0,vy:0,s:cell*0.55,s1:1.3,c:[255,120,70],a:.8,life:0.35,d:i*0.06});
  });
  forgeAdd({k:'glow',l:1,x:k.x,y:k.y,vx:0,vy:0,s:cell*0.9,s1:1.6,c:[255,80,50],a:1,life:0.4});
  forgeAdd({k:'ring',l:1,x:k.x,y:k.y,vx:0,vy:0,r0:cell*0.35,r1:cell*1.4,w:4*S,c:[255,90,60],life:0.5});
  for(let i=0;i<Math.round(16*forgeLevel());i++){
    const an=Math.random()*Math.PI*2,sp=(120+Math.random()*260)*S;
    forgeAdd({k:'spark',l:1,x:k.x,y:k.y,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,g:400*S,dr:3,w:1.4*S,len:12*S,
      c:Math.random()<0.4?FORGE_HOT:[255,110,70],life:0.3+Math.random()*0.3});
  }
}
function forgeBoltPath(x0,y0,x1,y1,S){
  const dx=x1-x0,dy=y1-y0,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;
  const n=Math.max(5,Math.round(l/(14*S)));
  const pts=[[x0,y0]];
  for(let i=1;i<n;i++){
    const t=i/n,j=(Math.random()-0.5)*18*S*Math.sin(Math.PI*t);
    pts.push([x0+dx*t+nx*j,y0+dy*t+ny*j]);
  }
  pts.push([x1,y1]);
  return pts;
}
function forgeDrawBolt(c,p,u){
  if(!p.seg||p.t>=p.next){p.seg=forgeBoltPath(p.x,p.y,p.bx,p.by,p.S);p.next=p.t+0.045;}
  // Il s'allume d'un coup, tient, puis s'éteint en clignant.
  let a=u<0.08?u/0.08:(u>0.6?(1-u)/0.4:1);
  if(u>0.45)a*=0.55+0.45*Math.round(Math.random());
  c.globalCompositeOperation='lighter';c.lineJoin='round';c.lineCap='round';
  const path=()=>{c.beginPath();p.seg.forEach((q,i)=>i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]));};
  path();c.strokeStyle='rgba('+p.c.join(',')+','+(0.28*a).toFixed(3)+')';c.lineWidth=9*p.S;c.stroke();
  path();c.strokeStyle='rgba('+p.c.join(',')+','+(0.7*a).toFixed(3)+')';c.lineWidth=3.2*p.S;c.stroke();
  path();c.strokeStyle='rgba(255,240,220,'+(0.95*a).toFixed(3)+')';c.lineWidth=1.3*p.S;c.stroke();
  c.globalCompositeOperation='source-over';
}

// ----------------------------------------------------------------
// LE MAT
// ----------------------------------------------------------------
// Le temps se fige presque, le roi se fend de lumière, et une onde fait le
// tour du plateau entier. Puis la victoire monte en or, ou la défaite
// retombe en cendres. Tout tient dans le délai qu'accorde déjà
// fxOutcomeDelay (combat-fx.js) à la cinématique d'issue.
function forgeMate(r,c,playerWins){
  if(!forgeOn())return;
  const g=forgeEnsure();if(!g)return;
  const S=forgeS(),cell=forgeCell(),o=forgeXY(r,c);
  const col=playerWins?FORGE_GOLD:FORGE_BLOOD;
  forgeSlow(0.25,520);
  forgeAdd({k:'glow',l:1,x:o.x,y:o.y,vx:0,vy:0,s:cell*1.6,s1:1.8,c:forgeMix(col,FORGE_HOT,.5),a:1,life:0.5});
  for(let i=0;i<3;i++)
    forgeAdd({k:'ring',l:1,x:o.x,y:o.y,vx:0,vy:0,d:i*0.12,r0:cell*0.3,r1:g.w*(0.55+i*0.35),w:(7-i*2)*S,c:col,a:.85,life:0.9+i*0.15});
  forgeAdd({k:'crack',l:1,x:o.x,y:o.y,vx:0,vy:0,life:1.4,c:col,cell,S,rays:forgeCrackRays(cell)});
  for(let i=0;i<Math.round(70*forgeLevel());i++){
    const an=-Math.PI/2+(Math.random()-0.5)*2.6,sp=(220+Math.random()*560)*S;
    forgeAdd({k:'spark',l:1,x:o.x,y:o.y,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,g:900*S,dr:1.4,
      w:(1.2+Math.random()*1.8)*S,len:20*S,c:Math.random()<0.4?FORGE_HOT:col,head:Math.random()<0.25,
      life:0.6+Math.random()*0.7,d:Math.random()*0.1});
  }
  forgeRipple(r,c,1,7);
  forgeRecoil(null,1);
  if(playerWins)forgeGoldRise(0.25);
  else forgeAsh(0.25);
}
// Les fissures du roi : huit rais brisés qui partent du centre de sa case.
function forgeCrackRays(cell){
  const rays=[];
  const n=7+Math.floor(Math.random()*3);
  for(let i=0;i<n;i++){
    const a=(i/n)*Math.PI*2+(Math.random()-0.5)*0.4;
    const len=cell*(0.35+Math.random()*0.35);
    const pts=[[0,0]];let x=0,y=0;
    const steps=4;
    for(let s=1;s<=steps;s++){
      const aa=a+(Math.random()-0.5)*0.7;
      x+=Math.cos(aa)*len/steps;y+=Math.sin(aa)*len/steps;pts.push([x,y]);
    }
    rays.push(pts);
  }
  return rays;
}
function forgeDrawCrack(c,p,u){
  const grow=Math.min(1,u/0.22);
  const a=u>0.6?(1-u)/0.4:1;
  c.save();c.translate(p.x,p.y);
  c.globalCompositeOperation='lighter';c.lineCap='round';c.lineJoin='round';
  p.rays.forEach(pts=>{
    const n=Math.max(1,Math.round((pts.length-1)*grow));
    c.beginPath();c.moveTo(0,0);
    for(let i=1;i<=n;i++)c.lineTo(pts[i][0],pts[i][1]);
    c.strokeStyle='rgba('+p.c.join(',')+','+(0.35*a).toFixed(3)+')';c.lineWidth=6*p.S;c.stroke();
    c.strokeStyle='rgba(255,246,226,'+(0.95*a).toFixed(3)+')';c.lineWidth=1.6*p.S;c.stroke();
  });
  c.restore();
}

// LA POUSSIÈRE D'OR de la victoire : un essaim qui monte de tout le plateau,
// en ondulant. Il accompagne la dissolution dorée de combat-fx.js
// (fxGoldDissolve), qui monte le voile ; ici, c'est la matière.
function forgeGoldRise(delay){
  if(!forgeOn())return;
  const g=forgeEnsure();if(!g)return;
  const S=forgeS(),n=Math.round(170*forgeLevel());
  for(let i=0;i<n;i++){
    const x0=Math.random()*g.w,ph=Math.random()*6,amp=(6+Math.random()*16)*S,fr=1.5+Math.random()*2.5;
    forgeAdd({k:'ember',l:1,x:x0,y:g.h*(0.35+Math.random()*0.75),vx:0,vy:-(60+Math.random()*170)*S,
      s:(1.5+Math.random()*4.5)*S,c:Math.random()<0.25?FORGE_HOT:FORGE_GOLD,a:1,fl:10,ph,
      life:1.1+Math.random()*1.1,d:(delay||0)+Math.random()*0.9,
      up:(p,dt)=>{p.y+=p.vy*dt;p.x=x0+Math.sin(p.t*fr+ph)*amp;}});
  }
}
// LES CENDRES de la défaite : elles tombent, lentes, et quelques braises
// rouges meurent avec elles.
function forgeAsh(delay){
  if(!forgeOn())return;
  const g=forgeEnsure();if(!g)return;
  const S=forgeS(),n=Math.round(90*forgeLevel());
  for(let i=0;i<n;i++){
    const red=Math.random()<0.25;
    const x0=Math.random()*g.w,ph=Math.random()*6,amp=(5+Math.random()*12)*S;
    forgeAdd({k:red?'ember':'amb',l:1,x:x0,y:-10-Math.random()*g.h*0.4,vx:0,vy:(30+Math.random()*60)*S,
      s:(1.6+Math.random()*3.4)*S,c:red?FORGE_EMBER:[150,150,150],a:red?0.9:0.55,
      life:1.4+Math.random()*1,d:(delay||0)+Math.random()*0.7,
      up:(p,dt)=>{p.y+=p.vy*dt;p.x=x0+Math.sin(p.t*1.8+ph)*amp;}});
  }
}

// ----------------------------------------------------------------
// LES GRANDS POUVOIRS
// ----------------------------------------------------------------
function forgePower(kind,r,c){
  if(!forgeOn())return;
  const g=forgeEnsure();if(!g)return;
  const S=forgeS(),cell=forgeCell(),o=forgeXY(r,c),lv=forgeLevel();
  switch(kind){
    // LE TYPHON ASPIRE : des motes violettes tournent en spirale vers lui
    // depuis ses huit voisines, puis il éclate.
    case 'typhon':{
      const col=forgeRGB('--sorcier');
      for(let i=0;i<Math.round(70*lv);i++){
        const a0=Math.random()*Math.PI*2,r0=cell*(0.9+Math.random()*1.2),spin=3+Math.random()*3;
        forgeAdd({k:'ember',l:1,x:o.x,y:o.y,vx:0,vy:0,s:(2+Math.random()*3)*S,c:Math.random()<0.3?FORGE_HOT:col,a:1,
          life:0.55+Math.random()*0.3,d:Math.random()*0.15,
          up:(p,dt)=>{const u=p.t/p.life,rr=r0*(1-u*u),aa=a0+u*spin;p.x=o.x+Math.cos(aa)*rr;p.y=o.y+Math.sin(aa)*rr;}});
      }
      forgeAdd({k:'ring',l:1,x:o.x,y:o.y,vx:0,vy:0,d:0.45,r0:cell*0.2,r1:cell*2.2,w:6*S,c:col,life:0.5});
      forgeRipple(r,c,1,2);
      break;
    }
    // LE CRI DE LA BANSHEE : trois ondes pâles, très larges, qui partent
    // l'une après l'autre.
    case 'banshee':{
      for(let i=0;i<3;i++)forgeAdd({k:'ring',l:1,x:o.x,y:o.y,vx:0,vy:0,d:i*0.11,r0:cell*0.3,r1:cell*(2+i*0.8),
        w:(4-i)*S,c:[200,230,255],a:.75,life:0.7});
      break;
    }
    // LA PROMOTION : une colonne de motes d'or qui monte de la case.
    case 'promo':{
      for(let i=0;i<Math.round(46*lv);i++){
        forgeAdd({k:'ember',l:1,x:o.x+(Math.random()-0.5)*cell*0.6,y:o.y+cell*0.35,vx:(Math.random()-0.5)*20*S,
          vy:-(90+Math.random()*220)*S,dr:0.6,s:(1.6+Math.random()*3.6)*S,c:Math.random()<0.3?FORGE_HOT:FORGE_GOLD,
          a:1,fl:12,ph:Math.random()*6,life:0.7+Math.random()*0.7,d:Math.random()*0.35});
      }
      forgeAdd({k:'glow',l:0,x:o.x,y:o.y,vx:0,vy:0,s:cell*1.1,s1:1.4,c:FORGE_GOLD,a:.9,life:0.6});
      break;
    }
  }
}
// LA CHARGE DE L'ÉLÉPHANT : un panache de poussière sur chaque case
// traversée, et des éclats de pierre.
function forgeCharge(from,to){
  if(!forgeOn())return;
  const g=forgeEnsure();if(!g)return;
  const S=forgeS(),cell=forgeCell();
  const dr=Math.sign(to.r-from.r),dc=Math.sign(to.c-from.c);
  const steps=Math.max(Math.abs(to.r-from.r),Math.abs(to.c-from.c));
  for(let i=1;i<=steps;i++){
    const q=forgeXY(from.r+dr*i,from.c+dc*i),d=(i-1)/steps*0.17;
    for(let j=0;j<3;j++)forgeAdd({k:'smoke',l:0,x:q.x+(Math.random()-0.5)*cell*0.5,y:q.y+(Math.random()-0.5)*cell*0.4,
      vx:(Math.random()-0.5)*50*S,vy:-(10+Math.random()*30)*S,dr:1,s:cell*0.3,s1:2.2,a:0.7,life:0.8,d});
    for(let j=0;j<Math.round(6*forgeLevel());j++){
      const an=-Math.PI/2+(Math.random()-0.5)*2.4,sp=(120+Math.random()*200)*S;
      forgeAdd({k:'spark',l:1,x:q.x,y:q.y,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp,g:900*S,dr:1.5,w:1.6*S,len:7*S,
        c:[214,190,150],life:0.5,d});
    }
  }
}

// ----------------------------------------------------------------
// LES BRAISES D'AMBIANCE
// ----------------------------------------------------------------
// Pendant toute la partie, quelques braises montent lentement du bas du
// plateau. C'est la seule chose de la Forge qui ne réponde à aucun
// événement : elle dit seulement que la salle est chauffée. Elles
// s'attisent quand une pendule brûle (--heat, clockFire dans
// js/game-render.js), et s'éteignent dès la partie finie.
function forgeAmbientWanted(){
  if(!_fg||!document.body.classList.contains('in-game'))return false;
  if(typeof GS!=='undefined'&&GS&&GS.gameOver)return false;
  return forgeOn();
}
function forgeAmbientHeat(){
  let h=0;
  document.querySelectorAll('#page-game .on-fire').forEach(el=>{
    const v=parseFloat(el.style.getPropertyValue('--heat'));if(v>h)h=v;
  });
  return h;
}
function forgeAmbientTick(dt){
  if(!forgeAmbientWanted())return false;
  const heat=forgeAmbientHeat();
  const rate=(2.4+heat*9)*forgeLevel();
  _fgAmbAcc+=rate*dt/Math.max(0.05,_fgScale);
  const S=forgeS();
  while(_fgAmbAcc>=1){
    _fgAmbAcc-=1;
    if(_fgParts.filter(p=>p.k==='amb').length>46)break;
    const x0=Math.random()*_fg.w,ph=Math.random()*6,amp=(4+Math.random()*10)*S;
    const hot=Math.random()<0.25+heat*0.4;
    forgeAdd({k:'amb',l:1,x:x0,y:_fg.h+4,vx:0,vy:-(14+Math.random()*26+heat*40)*S,
      s:(1.6+Math.random()*2.6)*S,c:hot?FORGE_EMBER:[255,196,120],a:0.5+Math.random()*0.35+heat*0.2,
      fl:6+Math.random()*6,ph,life:3.5+Math.random()*3,
      up:(p,dt2)=>{p.y+=p.vy*dt2;p.x=x0+Math.sin(p.t*0.9+ph)*amp;}});
  }
  return true;
}
// Appelée à chaque rendu du plateau (renderGame) : crée les canvas s'il le
// faut, et réveille la boucle pour les braises. Elle ne fait rien d'autre :
// un rendu ne coûte jamais une particule.
function forgeTouch(){
  if(!forgeOn())return;
  if(!forgeEnsure())return;
  if(forgeAmbientWanted())forgeWake();
}
