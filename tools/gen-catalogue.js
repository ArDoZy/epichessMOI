// ================================================================
// GEN-CATALOGUE.JS : le catalogue du jeu, recopié pour le serveur
// ================================================================
// Le serveur tient maintenant l'économie (coffres, perles, jokers, quêtes,
// colonne des victoires…) : il doit connaître les mêmes pièces, les mêmes
// coffres et les mêmes paliers que le jeu. Les écrire une seconde fois à la
// main, c'était deux tables à garder d'accord pour toujours.
//
// Ce script les LIT dans les fichiers du jeu (js/data-pieces.js,
// js/rewards.js, js/economy.js, js/tutorial.js, js/multiplayer.js) par la
// fonction ecoBuildCatalogue de js/eco-rules.js, et les écrit dans supabase/schema.sql, entre les deux marqueurs
// « -- <catalogue> » et « -- </catalogue> », sous la forme d'une fonction
// ec_cat() qui rend un seul objet JSON.
//
//   node tools/gen-catalogue.js           réécrit le bloc
//   node tools/gen-catalogue.js --check   échoue si le bloc n'est pas à jour
//                                         (c'est ce que lance la CI)
//
// APRÈS AVOIR TOUCHÉ AU CATALOGUE (une pièce, un coffre, un palier) : lancer
// le script, puis recoller supabase/schema.sql dans Supabase.
// ================================================================
const fs=require('fs'),path=require('path');
const {loadEngine}=require('./tests/load-engine');
const ROOT=path.join(__dirname,'..');
const E=loadEngine(['js/data-pieces.js','js/economy.js','js/rewards.js','js/eco-rules.js']);
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const grab=(f,re)=>{const m=read(f).match(re);if(!m)throw new Error('introuvable dans '+f+' : '+re);return m[1];};

// Le catalogue est construit par js/eco-rules.js (ecoBuildCatalogue), la
// même fonction que le bac à sable ?mock : une seule définition. Ce qui vit
// dans des fichiers que Node ne charge pas (tutorial.js, multiplayer.js) est
// lu ici et passé en paramètre.
const cat=E('ecoBuildCatalogue')({
  armyBudget:Number(grab('js/multiplayer.js',/const MP_ARMY_BUDGET=(\d+)/)),
  tuto:{pieces:JSON.parse(grab('js/tutorial.js',/const TUTO_SKIP_PIECES=(\[[^\]]*\])/).replace(/'/g,'"')),
        qty:Number(grab('js/tutorial.js',/const TUTO_SKIP_QTY=(\d+)/))},
});

const json=JSON.stringify(cat).replace(/'/g,"''");
const block='-- <catalogue>\n'+
'-- ENGENDRÉ PAR tools/gen-catalogue.js À PARTIR DES FICHIERS DU JEU : ne pas\n'+
'-- modifier à la main, relancer le script.\n'+
"create or replace function public.ec_cat() returns jsonb\n"+
"language sql immutable parallel safe as $$ select '"+json+"'::jsonb $$;\n"+
'-- </catalogue>';

const file=path.join(ROOT,'supabase','schema.sql');
const sql=fs.readFileSync(file,'utf8');
const re=/-- <catalogue>[\s\S]*?-- <\/catalogue>/;
if(!re.test(sql))throw new Error('marqueurs -- <catalogue> absents de supabase/schema.sql');
const next=sql.replace(re,()=>block);
if(process.argv.includes('--check')){
  if(next!==sql){console.error('Le catalogue de supabase/schema.sql n\'est pas à jour : node tools/gen-catalogue.js');process.exit(1);}
  console.log('Catalogue à jour.');
}else{
  fs.writeFileSync(file,next);
  console.log('Catalogue écrit ('+json.length+' octets).');
}
