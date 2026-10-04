// ================================================================
// GEN-CATALOGUE.JS : le catalogue du jeu, recopié pour le serveur
// ================================================================
// Le serveur tient maintenant l'économie (coffres, perles, jokers, quêtes,
// colonne des victoires…) : il doit connaître les mêmes pièces, les mêmes
// coffres et les mêmes paliers que le jeu. Les écrire une seconde fois à la
// main, c'était deux tables à garder d'accord pour toujours.
//
// Ce script les LIT dans les fichiers du jeu (js/data-pieces.js,
// js/rewards.js, js/economy.js, js/tutorial.js, js/multiplayer.js) et les
// écrit dans supabase/schema.sql, entre les deux marqueurs
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
const E=loadEngine(['js/data-pieces.js','js/economy.js','js/rewards.js']);
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const grab=(f,re)=>{const m=read(f).match(re);if(!m)throw new Error('introuvable dans '+f+' : '+re);return m[1];};

const pieces={};
E('PIECES').forEach(p=>{
  pieces[p.id]={name:p.name,cls:p.class,value:p.value,qty:p.qty,type:p.pieceType,
    power:!!p.ability,arena:E('pieceArenaIdx')(p.id)};
});
const cat={
  pieces,
  free:[...E('FREE_PIECE_IDS')],
  ranks:E('RANKS').map(r=>({id:r.id,min:r.min})),
  chests:Object.fromEntries(E('CHESTS').map(c=>[c.id,{tier:c.tier,rolls:c.rolls,total:c.total,
    newChance:c.newChance,bias:c.bias,debris:c.debris,
    pearls:E('chestPearlRange')(c.id),price:E('chestPearlPrice')(c.id)}])),
  chestPity:E('CHEST_PITY'),
  debrisNeeded:E('POWER_DEBRIS_NEEDED'),
  restock:{perPiece:E('DAILY_CHEST').perPiece,cap:E('DAILY_CHEST').cap},
  daily:E('DAILY_REWARDS'),
  starterStock:E('STARTER_STOCK'),
  starterPieces:E('UNLOCK_TABLE').filter(u=>u.eloRequired===0&&!u.coffre&&u.pieceId).map(u=>u.pieceId),
  milestones:E('UNLOCK_MILESTONES').filter(u=>u.reward).map(u=>({id:u.id,elo:u.eloRequired,reward:u.reward,
    chest:u.chest||null,amount:u.amount||null,copyId:u.copyId||null,qty:u.qty||null})),
  legacyUnlocks:E('LEGACY_ELO_UNLOCKS'),
  retired:[...E('RETIRED_PIECE_IDS')],
  column:E('VICTORY_COLUMN'),
  laurelsPerStep:E('LAURELS_PER_STEP'),
  laurelScale:E('LAUREL_SCALE'),
  laurelsFloor:E('LAURELS_FLOOR'),
  wealth:E('WEALTH_ROW'),
  quests:E('QUEST_POOL').map(q=>({id:q.id,event:q.event,piece:q.piece,target:q.target,tickets:q.tickets})),
  questsPerDay:E('QUESTS_PER_DAY'),
  ai:Object.fromEntries(E('AI_OPPONENTS').map(o=>[o.id,o.elo])),
  pawnArmies:E('PAWN_ARMIES').map(a=>a.id),
  armyBudget:Number(grab('js/multiplayer.js',/const MP_ARMY_BUDGET=(\d+)/)),
  tuto:{pieces:JSON.parse(grab('js/tutorial.js',/const TUTO_SKIP_PIECES=(\[[^\]]*\])/).replace(/'/g,'"')),
        qty:Number(grab('js/tutorial.js',/const TUTO_SKIP_QTY=(\d+)/))},
};

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
