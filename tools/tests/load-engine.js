// Charge le moteur de règles du jeu (scripts globaux du navigateur) dans un
// bac à sable Node, avec juste assez de faux DOM pour qu'il s'évalue. Les
// tests unitaires de tools/tests/ s'en servent : ils vérifient les règles
// sans navigateur, en quelques millisecondes.
const vm=require('vm'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','..');
function loadEngine(files){
  const noop=()=>{};
  const el=()=>({style:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
    appendChild:noop,setAttribute:noop,addEventListener:noop,querySelector:()=>null,querySelectorAll:()=>[]});
  const ctx={console,Math,Date,Set,Map,JSON,Object,Array,String,Number,Promise,
    setTimeout,clearTimeout,setInterval,clearInterval};
  ctx.window=ctx;ctx.self=ctx;
  ctx.document={getElementById:()=>null,addEventListener:noop,querySelector:()=>null,
    querySelectorAll:()=>[],createElement:el,body:el(),documentElement:el()};
  ctx.localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
  vm.createContext(ctx);
  (files||['js/data-pieces.js','js/rules-engine.js']).forEach(f=>{
    vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
  });
  return expr=>vm.runInContext(expr,ctx);
}
module.exports={loadEngine};
