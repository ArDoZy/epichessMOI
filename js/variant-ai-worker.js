// ================================================================
// VARIANT-AI-WORKER.JS : les adversaires des variantes, hors du fil principal
// ================================================================
// Board Quake, Mirror Chess et le Cheval de Troie cherchaient leur coup sur
// le fil principal, jusqu'à 700 ms d'affilée : l'écran se figeait à chaque
// réponse de l'IA (pas d'animation, pas de clic, pas de pendule). Leurs
// moteurs ne touchent ni au DOM ni à `window` (voir l'en-tête de
// fok-rules.js, mirror-rules.js, troie-rules.js) : ils se chargent donc tels
// quels ici, par importScripts, et la recherche tourne à côté de l'écran.
//
// Le protocole est minimal : { id, scripts, fn, args } → { id, ok, res }.
// `scripts` sont des noms de fichiers de js/ (chargés une seule fois),
// `fn` le nom d'une fonction globale déclarée par eux.
//
// Ce fichier n'est chargé QUE comme Worker (js/variant-ai.js), jamais par
// une balise <script>.
// ================================================================
const _loaded=Object.create(null);
self.onmessage=function(e){
  const d=e.data||{};
  try{
    for(const s of d.scripts||[]){
      if(!/^[a-z-]+\.js$/.test(s))throw new Error('script refusé : '+s);
      if(!_loaded[s]){importScripts(s);_loaded[s]=1;}
    }
    const fn=self[d.fn];
    if(typeof fn!=='function')throw new Error('fonction inconnue : '+d.fn);
    self.postMessage({id:d.id,ok:true,res:fn.apply(null,d.args||[])});
  }catch(err){
    self.postMessage({id:d.id,ok:false,err:String((err&&err.message)||err)});
  }
};
