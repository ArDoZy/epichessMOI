// ================================================================
// VARIANT-AI.JS : faire réfléchir l'IA d'une variante sans figer l'écran
// ================================================================
// Un seul point d'entrée, variantAIRun(job, done) :
//
//   job  = { scripts:['fok-rules.js','fok-ai.js'], fn:'fokAIMove', args:[st,level] }
//   done = function(res) — appelée UNE fois, avec ce qu'a rendu fn(...args)
//
// La recherche part dans un Worker (js/variant-ai-worker.js). Si le Worker
// est indisponible — page ouverte en double-cliquant sur index.html
// (file://), navigateur sans Worker, script introuvable, erreur dans la
// recherche — ou s'il ne répond pas dans le délai, on retombe sur l'ancien
// chemin : la même fonction, appelée ici, sur le fil principal. Le résultat
// est donc toujours le même ; seul l'endroit où il se calcule change.
//
// LE COUP RENDU EST UNE COPIE. Le Worker travaille sur un clone de l'état :
// l'appelant doit retrouver le coup légal correspondant dans SON état
// (fokFindMove & co., le même chemin que les coups reçus du réseau), et
// vérifier que la partie n'a pas changé pendant la réflexion.
//
// Dépendances : aucune. Utilisé par : fok-game.js, mirror-game.js, troie-game.js.
// ================================================================

let _vaiWorker=null,_vaiBroken=false,_vaiSeq=0;
const _vaiPending=new Map();
const VAI_TIMEOUT_MS=6000;   // la plus longue recherche dure 700 ms

function _vaiLocal(job){
  const fn=(typeof window!=='undefined')?window[job.fn]:null;
  return typeof fn==='function'?fn.apply(null,job.args||[]):null;
}

function _vaiGetWorker(){
  if(_vaiBroken)return null;
  if(_vaiWorker)return _vaiWorker;
  try{
    if(typeof Worker!=='function'||location.protocol==='file:')throw 0;
    _vaiWorker=new Worker('js/variant-ai-worker.js');
    _vaiWorker.onmessage=e=>{
      const d=e.data||{},p=_vaiPending.get(d.id);
      if(!p)return;
      _vaiPending.delete(d.id);clearTimeout(p.timer);
      if(d.ok)p.done(d.res);
      else p.done(_vaiLocal(p.job));
    };
    _vaiWorker.onerror=e=>{
      // Script introuvable, CSP… : on n'y revient plus, et tout ce qui
      // attendait se calcule ici.
      if(e&&e.preventDefault)e.preventDefault();
      _vaiDisable();
    };
  }catch(e){_vaiBroken=true;_vaiWorker=null;}
  return _vaiWorker;
}

function _vaiDisable(){
  _vaiBroken=true;
  if(_vaiWorker){try{_vaiWorker.terminate();}catch(e){}}
  _vaiWorker=null;
  const waiting=[..._vaiPending.values()];_vaiPending.clear();
  waiting.forEach(p=>{clearTimeout(p.timer);p.done(_vaiLocal(p.job));});
}

function variantAIRun(job,done){
  let called=false;
  const once=res=>{if(called)return;called=true;done(res);};
  const w=_vaiGetWorker();
  if(!w){
    // Chemin d'avant : synchrone, mais après un rendu, pour que
    // « L'adversaire réfléchit… » soit affiché avant que le fil ne se bloque.
    requestAnimationFrame(()=>once(_vaiLocal(job)));
    return;
  }
  const id=++_vaiSeq;
  const timer=setTimeout(()=>{if(_vaiPending.has(id))_vaiDisable();},VAI_TIMEOUT_MS);
  _vaiPending.set(id,{job,done:once,timer});
  try{w.postMessage({id,scripts:job.scripts,fn:job.fn,args:job.args});}
  catch(e){_vaiPending.delete(id);clearTimeout(timer);requestAnimationFrame(()=>once(_vaiLocal(job)));}
}
