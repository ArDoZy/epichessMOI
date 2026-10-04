// ================================================================
// ECO-RULES.JS : l'économie et les parties, telles que le SERVEUR les tient
// ================================================================
// Le serveur (supabase/schema.sql) tire les coffres, tient l'inventaire,
// ouvre et règle les parties. Ce fichier en est la TRANSCRIPTION en
// JavaScript, fonction pour fonction (ec_chest_open → ecoChestOpen, etc.),
// pour deux usages seulement :
//
//   · le bac à sable `?mock` (js/server.js), qui remplace le serveur quand on
//     travaille sans réseau et pendant le test de fumée ;
//   · le catalogue (ecoBuildCatalogue), que tools/gen-catalogue.js recopie
//     dans supabase/schema.sql — une seule définition pour les deux.
//
// LE JEU NE S'EN SERT PAS POUR DÉCIDER. En production, rien ici ne s'exécute
// en dehors du catalogue : le navigateur ne fait que montrer ce que le
// serveur a décidé. Si vous touchez à une règle, touchez aux deux (le test de
// fumée joue l'économie ici, tools/tests/sql.test.js la joue en SQL).
//
// Dépendances : data-pieces.js, economy.js, rewards.js (les tables), au
// moment de l'appel seulement.
// ================================================================

// -- LE CATALOGUE ----------------------------------------------------
// `o` permet au générateur (qui ne charge pas tutorial.js ni
// multiplayer.js) de fournir ce qu'il lit ailleurs.
function ecoBuildCatalogue(o){
  o=o||{};
  const pieces={};
  PIECES.forEach(p=>{
    pieces[p.id]={name:p.name,cls:p.class,value:p.value,qty:p.qty,type:p.pieceType,
      power:!!p.ability,arena:pieceArenaIdx(p.id)};
  });
  return{
    pieces,
    free:[...FREE_PIECE_IDS],
    ranks:RANKS.map(r=>({id:r.id,min:r.min})),
    chests:Object.fromEntries(CHESTS.map(c=>[c.id,{tier:c.tier,rolls:c.rolls,total:c.total,
      newChance:c.newChance,bias:c.bias,debris:c.debris,
      pearls:chestPearlRange(c.id),price:chestPearlPrice(c.id)}])),
    chestPity:CHEST_PITY,
    debrisNeeded:POWER_DEBRIS_NEEDED,
    restock:{perPiece:DAILY_CHEST.perPiece,cap:DAILY_CHEST.cap},
    daily:DAILY_REWARDS,
    starterStock:STARTER_STOCK,
    starterPieces:UNLOCK_TABLE.filter(u=>u.eloRequired===0&&!u.coffre&&u.pieceId).map(u=>u.pieceId),
    milestones:UNLOCK_MILESTONES.filter(u=>u.reward).map(u=>({id:u.id,elo:u.eloRequired,reward:u.reward,
      chest:u.chest||null,amount:u.amount||null,copyId:u.copyId||null,qty:u.qty||null})),
    legacyUnlocks:LEGACY_ELO_UNLOCKS,
    retired:[...RETIRED_PIECE_IDS],
    column:VICTORY_COLUMN,
    laurelsPerStep:LAURELS_PER_STEP,
    laurelScale:LAUREL_SCALE,
    laurelsFloor:LAURELS_FLOOR,
    wealth:WEALTH_ROW,
    quests:QUEST_POOL.map(q=>({id:q.id,event:q.event,piece:q.piece,target:q.target,tickets:q.tickets})),
    questsPerDay:QUESTS_PER_DAY,
    ai:Object.fromEntries(AI_OPPONENTS.map(a=>[a.id,a.elo])),
    pawnArmies:PAWN_ARMIES.map(a=>a.id),
    armyBudget:o.armyBudget!==undefined?o.armyBudget:MP_ARMY_BUDGET,
    tuto:o.tuto||{pieces:TUTO_SKIP_PIECES.slice(),qty:TUTO_SKIP_QTY},
  };
}
let _ecoCat=null;
function ecoCat(){return _ecoCat||(_ecoCat=JSON.parse(JSON.stringify(ecoBuildCatalogue())));}

// -- PETITS OUTILS ---------------------------------------------------
// Le jour du jeu : la date à Paris (ec_today).
function ecoToday(t){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'})
    .format(new Date(t||Date.now()));}
  catch(e){return new Date(t||Date.now()).toISOString().slice(0,10);}
}
const ecoRandInt=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const ecoInt=(st,k)=>typeof st[k]==='number'?Math.max(0,Math.floor(st[k])):0;
const ecoObj=(st,k)=>(st[k]&&typeof st[k]==='object'&&!Array.isArray(st[k]))?st[k]:{};
const ecoArr=(st,k)=>Array.isArray(st[k])?st[k]:[];
const ecoPiece=id=>ecoCat().pieces[id]||null;
const ecoOwnable=id=>!!id&&!!ecoCat().pieces[id];
const ecoHasPower=id=>!!(ecoPiece(id)&&ecoPiece(id).power);
const ecoDeploy=id=>((ecoPiece(id)||{}).qty||1)>=2?2:1;
function ecoArena(peak){return Math.max(0,ecoCat().ranks.filter(r=>r.min<=(peak|0)).length-1);}
function ecoClone(o){return JSON.parse(JSON.stringify(o||{}));}

function ecoInv(st,id){const v=ecoObj(st,'inventory')[id];return typeof v==='number'?Math.max(0,Math.floor(v)):0;}
function ecoInvAdd(st,id,n){
  if(!ecoOwnable(id)||!n)return;
  st.inventory=Object.assign({},ecoObj(st,'inventory'),{[id]:Math.max(0,ecoInv(st,id)+n)});
}
function ecoInvAddMap(st,m){Object.entries(m||{}).forEach(([k,v])=>{if(typeof v==='number')ecoInvAdd(st,k,v);});}
function ecoOwned(st){
  const s=new Set(ecoArr(st,'unlocked_pieces'));
  Object.entries(ecoObj(st,'inventory')).forEach(([k,v])=>{if(typeof v==='number'&&v>0)s.add(k);});
  return [...s].filter(ecoOwnable).sort();
}
const ecoUnlocked=st=>ecoArr(st,'unlocked_pieces');
const ecoPowers=st=>ecoArr(st,'unlocked_powers');
function ecoAddToList(st,k,v){if(!ecoArr(st,k).includes(v))st[k]=ecoArr(st,k).concat([v]);}
function ecoSetInt(st,k,n){st[k]=Math.max(0,n|0);}

// -- LE TIRAGE -------------------------------------------------------
function ecoPickWeighted(ids,bias){
  if(!ids.length)return null;
  const w=ids.map(id=>Math.pow(1/Math.max(1,(ecoPiece(id)||{}).value||3),1.7/Math.max(0.2,bias)));
  let r=Math.random()*w.reduce((a,b)=>a+b,0);
  for(let i=0;i<ids.length;i++){r-=w[i];if(r<=0)return ids[i];}
  return ids[ids.length-1];
}
function ecoSplit(total,n){
  n=Math.max(1,Math.min(n,total));
  if(n===1)return[total];
  const pool=[];for(let x=1;x<total;x++)pool.push(x);
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const cuts=pool.slice(0,n-1).sort((a,b)=>a-b);
  const parts=[];let prev=0;
  cuts.forEach(c=>{parts.push(c-prev);prev=c;});
  parts.push(total-prev);
  return parts;
}
function ecoApplyLots(st,lots){
  (lots||[]).forEach(l=>{
    if(l.pearls){ecoSetInt(st,'pearls',ecoInt(st,'pearls')+l.pearls);return;}
    if(l.debris){
      if(ecoHasPower(l.debris)&&!ecoPowers(st).includes(l.debris))
        st.debris=Object.assign({},ecoObj(st,'debris'),{[l.debris]:(ecoObj(st,'debris')[l.debris]|0)+l.qty});
      return;
    }
    if(!l.pieceId)return;
    ecoInvAdd(st,l.pieceId,l.qty);
    if(l.withPower&&ecoHasPower(l.pieceId))ecoAddToList(st,'unlocked_powers',l.pieceId);
    if(l.isNew&&!ecoUnlocked(st).includes(l.pieceId)){ecoAddToList(st,'unlocked_pieces',l.pieceId);ecoSetInt(st,'chest_dry',0);}
  });
}
// ec_chest_open : tire ET applique. Rend les lots.
function ecoChestOpen(st,peak,chestId){
  const c=ecoCat().chests[chestId];
  if(!c)throw ecoErr('Coffre inconnu.','22023');
  const owned=ecoOwned(st);
  const locked=Object.keys(ecoCat().pieces).filter(k=>!ecoUnlocked(st).includes(k)&&ecoPiece(k).arena<=ecoArena(peak)).sort();
  const dry=ecoInt(st,'chest_dry');
  const pity=dry>=ecoCat().chestPity;
  const lucky=Math.max(0.1,Math.min(0.75,0.22+c.tier*0.09-c.newChance*0.5));
  let lots=[{pearls:ecoRandInt(c.pearls[0],c.pearls[1])}];
  const total=Math.max(1,ecoRandInt(c.total[0],c.total[1]));
  if(locked.length&&(!owned.length||pity||Math.random()<c.newChance)){
    lots.push({pieceId:ecoPickWeighted(locked,c.bias),qty:Math.max(2,total),isNew:true});
    ecoApplyLots(st,lots);return lots;
  }
  if(locked.length)ecoSetInt(st,'chest_dry',dry+1);
  const sleepers=owned.filter(x=>ecoHasPower(x)&&!ecoPowers(st).includes(x));
  if(c.debris&&sleepers.length&&Math.random()<c.debris.p){
    const w=sleepers.map(id=>1+2*Math.min(1,(ecoObj(st,'debris')[id]|0)/ecoCat().debrisNeeded));
    let r=Math.random()*w.reduce((a,b)=>a+b,0),pick=sleepers[sleepers.length-1];
    for(let i=0;i<sleepers.length;i++){r-=w[i];if(r<=0){pick=sleepers[i];break;}}
    lots.push({debris:pick,qty:ecoRandInt(c.debris.n[0],c.debris.n[1])});
  }
  if(owned.length){
    ecoSplit(total,Math.max(1,c.rolls+ecoRandInt(-1,1))).forEach(qty=>{
      const good=Math.random()<lucky;
      lots.push({pieceId:ecoPickWeighted(owned,c.bias*(good?2.2:1)),qty,isNew:false,lucky:good});
    });
  }
  const merged=[];
  lots.forEach(l=>{
    if(!l.pieceId){merged.push(Object.assign({},l));return;}
    const ex=merged.find(m=>m.pieceId===l.pieceId);
    if(ex){ex.qty+=l.qty;ex.lucky=ex.lucky||l.lucky;}else merged.push(Object.assign({},l));
  });
  ecoApplyLots(st,merged);
  return merged;
}

// -- LES QUÊTES ------------------------------------------------------
function ecoShuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function ecoQuestsRoll(st){
  const pieces=ecoShuffle(ecoOwned(st).filter(x=>ecoPiece(x).cls!=='Monarque'));
  const tpls=ecoShuffle(ecoCat().quests.filter(q=>!q.piece||pieces.length)).slice(0,ecoCat().questsPerDay);
  let pi=0;
  return tpls.map(t=>{
    let pid=null;
    if(t.piece){if(pi>=pieces.length)pi=0;pid=pieces[pi++];}
    return{id:t.id,pieceId:pid,prog:0,done:false};
  });
}
// `ev` : {event:{pieceId|'*':n}}. Rend le nombre de tickets gagnés.
function ecoQuestsNote(st,ev){
  const qs=ecoArr(st,'quests').map(q=>Object.assign({},q));
  let earned=0;
  qs.forEach(q=>{
    if(q.done)return;
    const tpl=ecoCat().quests.find(x=>x.id===q.id);if(!tpl)return;
    const bag=(ev&&ev[tpl.event])||{};
    const n=tpl.piece?(bag[q.pieceId]|0):Object.values(bag).reduce((a,b)=>a+(b|0),0);
    if(n<=0)return;
    q.prog=tpl.event==='play'?Math.max(q.prog|0,Math.min(tpl.target,n)):Math.min(tpl.target,(q.prog|0)+n);
    if(q.prog>=tpl.target){q.done=true;earned+=tpl.tickets;}
  });
  st.quests=qs;
  if(earned)ecoSetInt(st,'tickets',ecoInt(st,'tickets')+earned);
  return earned;
}

// -- L'ENTRETIEN D'UN COMPTE (ec_eco_init) ---------------------------
function ecoInit(st,peak){
  st=st||{};
  const inv={};
  Object.entries(ecoObj(st,'inventory')).forEach(([k,v])=>{if(ecoOwnable(k)&&typeof v==='number')inv[k]=Math.max(0,Math.floor(v));});
  st.inventory=inv;
  st.unlocked_pieces=Array.isArray(st.unlocked_pieces)?st.unlocked_pieces.filter(ecoOwnable):ecoCat().starterPieces.slice();
  if(!st.powers_v1){
    Object.entries(ecoCat().legacyUnlocks).forEach(([id,lim])=>{if(lim<=(peak|0))ecoAddToList(st,'unlocked_pieces',id);});
    ecoOwned(st).forEach(k=>{if(ecoHasPower(k))ecoAddToList(st,'unlocked_powers',k);});
    st.powers_v1=true;
  }
  ecoUnlocked(st).forEach(k=>{if(!(k in st.inventory))st.inventory[k]=ecoCat().starterStock;});
  if(st.quests_day!==ecoToday()||!Array.isArray(st.quests)){st.quests_day=ecoToday();st.quests=ecoQuestsRoll(st);}
  if(!('col_laurels' in st)&&ecoInt(st,'col_wins')>0)
    ecoSetInt(st,'col_laurels',Math.min(ecoInt(st,'col_wins')*ecoCat().laurelsPerStep,ecoCat().column.length*ecoCat().laurelsPerStep));
  return st;
}
function ecoMilestones(st,oldPeak,newPeak){
  const got=[];
  if(newPeak<=oldPeak)return got;
  ecoCat().milestones.forEach(m=>{
    if(ecoArr(st,'voie_rewards_claimed').includes(m.id))return;
    if(!(m.elo>oldPeak&&m.elo<=newPeak))return;
    if(m.reward==='pearls')ecoSetInt(st,'pearls',ecoInt(st,'pearls')+m.amount);
    else if(m.reward==='chest')st.voie_chests=ecoArr(st,'voie_chests').concat([m.id]);
    else if(m.reward==='copies')ecoInvAdd(st,m.copyId,m.qty);
    ecoAddToList(st,'voie_rewards_claimed',m.id);
    got.push(m);
  });
  return got;
}
function ecoLaurelsFor(moves){
  const m=(typeof moves==='number')?moves:1000000;
  const t=ecoCat().laurelScale.slice().sort((a,b)=>a.upTo-b.upTo).find(x=>m<=x.upTo);
  return t?t.laurels:ecoCat().laurelsFloor;
}

function ecoErr(msg,code){const e=new Error(msg);e.code=code||'P0001';return e;}

// -- LES GESTES (ec_eco) ---------------------------------------------
function ecoAction(p,action,arg){
  arg=arg||{};
  if(p.is_admin&&action!=='sync')throw ecoErr('Le mode test ne touche pas à la progression.','22023');
  const st=ecoInit(ecoClone(p.state),p.elo_peak|0);
  const today=ecoToday();
  let r={};
  const C=ecoCat();
  if(action==='sync'){/* rien */}
  else if(action==='shop'){
    const c=C.chests[arg.chest];if(!c)throw ecoErr('Coffre inconnu.','22023');
    if(ecoInt(st,'pearls')<c.price)throw ecoErr('Il vous manque '+(c.price-ecoInt(st,'pearls'))+' perles pour ce coffre.','22023');
    ecoSetInt(st,'pearls',ecoInt(st,'pearls')-c.price);
    r={chest:arg.chest,lots:ecoChestOpen(st,p.elo_peak|0,arg.chest)};
  }else if(action==='daily'){
    if(st.dr_day===today)throw ecoErr('La récompense du jour a déjà été prise.','22023');
    const idx=ecoInt(st,'dr_idx')%C.daily.length,step=C.daily[idx];
    st.dr_day=today;st.dr_idx=ecoInt(st,'dr_idx')+1;
    r={step:Object.assign({idx},step)};
    if(step.chest)Object.assign(r,{chest:step.chest,lots:ecoChestOpen(st,p.elo_peak|0,step.chest)});
    else if(step.pearls)ecoSetInt(st,'pearls',ecoInt(st,'pearls')+step.pearls);
    else if(step.jokers)ecoSetInt(st,'jokers',ecoInt(st,'jokers')+step.jokers);
  }else if(action==='restock'){
    if(st.daily_last===today)throw ecoErr('Le réapprovisionnement du jour est déjà fait.','22023');
    const gains={};
    ecoOwned(st).forEach(k=>{const n=Math.min(C.restock.perPiece,C.restock.cap-ecoInv(st,k));if(n>0)gains[k]=n;});
    ecoInvAddMap(st,gains);st.daily_last=today;
    r={gains};
  }else if(action==='column'){
    const idx=ecoInt(st,'col_claimed');
    const n=Math.min(C.column.length,Math.floor(ecoInt(st,'col_laurels')/C.laurelsPerStep));
    if(idx>=n)throw ecoErr('Aucun palier à encaisser.','22023');
    const step=C.column[idx];ecoSetInt(st,'col_claimed',idx+1);
    r={step:Object.assign({idx},step)};
    if(step.chest)Object.assign(r,{chest:step.chest,lots:ecoChestOpen(st,p.elo_peak|0,step.chest)});
    else if(step.jokers)ecoSetInt(st,'jokers',ecoInt(st,'jokers')+step.jokers);
  }else if(action==='joker'){
    const n=ecoInt(st,'jokers');
    if(!n)throw ecoErr('Aucun joker à convertir.','22023');
    if(!ecoOwned(st).includes(arg.piece)||ecoPiece(arg.piece).cls==='Monarque')throw ecoErr('Cette créature ne peut pas recevoir de jokers.','22023');
    ecoSetInt(st,'jokers',0);ecoInvAdd(st,arg.piece,n);
    r={piece:arg.piece,qty:n};
  }else if(action==='wealth'){
    const idx=ecoInt(st,'rich_claimed'),step=C.wealth[idx];
    if(!step)throw ecoErr('La rangée est complète.','22023');
    if(ecoInt(st,'tickets')<step.cost)throw ecoErr('Pas assez de tickets.','22023');
    ecoSetInt(st,'tickets',ecoInt(st,'tickets')-step.cost);ecoSetInt(st,'rich_claimed',idx+1);
    ecoSetInt(st,'pearls',ecoInt(st,'pearls')+step.pearls);
    r={idx,pearls:step.pearls,cost:step.cost};
  }else if(action==='voie'){
    if(!ecoArr(st,'voie_chests').includes(arg.milestone))throw ecoErr('Ce coffre n\'est pas à vous.','22023');
    st.voie_chests=ecoArr(st,'voie_chests').filter(x=>x!==arg.milestone);
    const m=C.milestones.find(x=>x.id===arg.milestone);
    if(m&&m.reward==='chest')r={chest:m.chest,lots:ecoChestOpen(st,p.elo_peak|0,m.chest)};
  }else if(action==='awaken'){
    const k=arg.piece,need=C.debrisNeeded;
    if(!ecoHasPower(k)||ecoPowers(st).includes(k)||!ecoUnlocked(st).includes(k)||(ecoObj(st,'debris')[k]|0)<need)
      throw ecoErr('Il manque encore des débris magiques.','22023');
    st.debris=Object.assign({},ecoObj(st,'debris'),{[k]:(ecoObj(st,'debris')[k]|0)-need});
    ecoAddToList(st,'unlocked_powers',k);
    r={piece:k};
  }else if(action==='tuto'){
    const ids=arg.piece?[arg.piece]:C.tuto.pieces;
    const lots=[];
    ids.forEach(k=>{
      if(!C.tuto.pieces.includes(k))throw ecoErr('Pièce hors du tutoriel.','22023');
      if(ecoArr(st,'tuto_rewards').includes(k)||ecoUnlocked(st).includes(k))return;
      lots.push({pieceId:k,qty:C.tuto.qty,isNew:true,withPower:true});
      ecoAddToList(st,'tuto_rewards',k);
    });
    ecoApplyLots(st,lots);
    r={lots};
  }else throw ecoErr('Geste inconnu.','22023');
  p.state=st;
  return Object.assign(r,{ok:true,state:ecoClone(st),today});
}

// -- L'ARMÉE ---------------------------------------------------------
function ecoArmyNorm(a){
  a=a||{};
  const id=v=>(v&&typeof v==='object')?v.id:v;
  const mon=id(a.mon),gen=id(a.gen);
  const ex=(Array.isArray(a.extras)?a.extras:[]).map(id);
  const pw=[...new Set((Array.isArray(a.powers)?a.powers:[]).filter(x=>x===mon||x===gen||ex.includes(x)))].sort();
  return{mon,gen,extras:ex,powers:pw,pawns:a.pawns||null,
    placements:(a.placements&&typeof a.placements==='object')?a.placements:null};
}
function ecoArmyNeed(a){
  const need={};
  [a.mon,a.gen].forEach(id=>{if(ecoOwnable(id))need[id]=(need[id]||0)+1;});
  (a.extras||[]).forEach(id=>{if(ecoOwnable(id))need[id]=(need[id]||0)+ecoDeploy(id);});
  return need;
}
function ecoArmyCheck(raw,st,admin){
  const n=ecoArmyNorm(raw),C=ecoCat();
  const P=ecoPiece;
  if(!P(n.mon)||P(n.mon).cls!=='Monarque')throw ecoErr('Armée invalide : il lui faut un Monarque.','22023');
  if(!P(n.gen)||P(n.gen).cls!=='Général')throw ecoErr('Armée invalide : il lui faut un Général.','22023');
  if(n.extras.length!==3||new Set(n.extras).size!==3)throw ecoErr('Armée invalide : trois créatures différentes.','22023');
  if(n.extras.some(x=>!P(x)||P(x).cls==='Monarque'||P(x).cls==='Général'))throw ecoErr('Armée invalide : créature inconnue.','22023');
  if(n.extras.filter(x=>P(x).cls==='Primordiale').length>1)throw ecoErr('Armée invalide : une Primordiale au plus.','22023');
  const total=P(n.mon).value+P(n.gen).value+n.extras.reduce((t,x)=>t+P(x).value,0);
  if(total>C.armyBudget)throw ecoErr('Armée invalide : '+total+' points pour '+C.armyBudget+' au maximum.','22023');
  if(n.pawns&&!C.pawnArmies.includes(n.pawns))throw ecoErr('Armée invalide : troupe de pions inconnue.','22023');
  if(admin)return n;
  const need=ecoArmyNeed(n);
  Object.entries(need).forEach(([id,k])=>{
    if(ecoInv(st,id)<k)throw ecoErr('Stock insuffisant : '+P(id).name+' ('+ecoInv(st,id)+'/'+k+').','22023');
  });
  const mine=ecoPowers(st);
  n.powers=('powers' in (raw||{}))?n.powers.filter(x=>mine.includes(x))
    :mine.filter(x=>x===n.mon||x===n.gen||n.extras.includes(x)).sort();
  return n;
}
function ecoArmySame(a,b){
  const s=x=>(x||[]).slice().sort().join(',');
  return !!a&&!!b&&a.mon===b.mon&&a.gen===b.gen&&s(a.extras)===s(b.extras)&&s(a.powers)===s(b.powers);
}
function ecoClaimClean(t,d){
  d=d||{};
  const ids=[t.army.gen,...(t.army.extras||[])];
  const surv={};
  Object.entries((d.survivors&&typeof d.survivors==='object')?d.survivors:{}).forEach(([k,v])=>{
    if(k in (t.engaged||{})&&typeof v==='number')surv[k]=Math.max(0,Math.min(t.engaged[k],Math.floor(v)));
  });
  const caps={move:300,capture:16,check:60,mate:1,play:300,promo:8},ev={};
  Object.keys(caps).forEach(e=>{
    const src=d.events&&d.events[e];
    if(!src||typeof src!=='object')return;
    const m={};
    Object.entries(src).forEach(([k,v])=>{
      if((ids.includes(k)||k===t.army.mon)&&typeof v==='number')m[k]=Math.max(0,Math.min(caps[e],Math.floor(v)));
    });
    ev[e]=m;
  });
  const promos=(Array.isArray(d.promos)?d.promos:[]).filter(x=>ids.includes(x)&&ecoOwnable(x)).slice(0,8);
  let replay=d.replay||null;
  try{if(replay&&JSON.stringify(replay).length>32768)replay=null;}catch(e){replay=null;}
  return{survivors:surv,events:ev,promos,moves:Math.max(0,Math.min(1000,d.moves==null?1000:Math.floor(d.moves))),
    replay,opp_army:(d.opp_army&&typeof d.opp_army==='object')?ecoArmyNorm(d.opp_army):null};
}

// -- LES PARTIES -----------------------------------------------------
// `db.matches` : les billets, tenus par js/server.js (bac à sable).
// `hooks` : ce que le bac à sable fournit (ELO, guerre des clans).
const ecoResRank=r=>r==='win'?2:r==='draw'?1:0;
const ecoResInv=r=>r==='win'?'loss':r==='loss'?'win':'draw';
const ecoWorst=(a,b)=>ecoResRank(a)<=ecoResRank(b)?a:b;

function ecoMatchApply(db,hooks,tid,res,reason){
  const t=db.matches[tid];
  if(!t||t.settled_at)return t&&t.outcome;
  const p=db.players[t.player_id];if(!p)return null;
  const d=t.claim_data||{};
  const counts=t.ranked&&!['void','short','unmatched'].includes(reason);
  const rewards=t.mode!=='tuto'&&!p.is_admin&&!['abandon','void','short','unmatched'].includes(reason);
  const oldElo=p.elo|0,oldPeak=p.elo_peak|0;let newElo=oldElo,delta=0;
  if(counts){
    const c=hooks.elo(oldElo,t.opp_elo,res,p.ranked_games|0);
    newElo=c.newElo;delta=c.delta;
    p.cur_streak=res==='win'?(p.cur_streak|0)+1:0;
    p.best_streak=Math.max(p.best_streak|0,p.cur_streak);
    p.piece_stats=p.piece_stats||{};
    new Set([t.army.mon,t.army.gen,...(t.army.extras||[])].filter(ecoOwnable)).forEach(k=>{
      const e=p.piece_stats[k]||{g:0,w:0};e.g++;if(res==='win')e.w++;p.piece_stats[k]=e;
    });
    p.elo=newElo;p.elo_peak=Math.max(oldPeak,newElo);
    p.ranked_games=(p.ranked_games|0)+1;
    if(res==='win')p.ranked_wins=(p.ranked_wins|0)+1;
    if(res==='draw')p.ranked_draws=(p.ranked_draws|0)+1;
  }
  const st=ecoInit(ecoClone(p.state),oldPeak);
  const need=t.engaged||{},returned={},lost={},gained={};
  Object.keys(need).forEach(k=>{
    const back=reason==='void'?need[k]:res==='loss'?0:Math.min((d.survivors||{})[k]|0,need[k]);
    if(back>0)returned[k]=back;
    if(need[k]-back>0)lost[k]=need[k]-back;
  });
  ecoInvAddMap(st,returned);
  let laurels=null,earned=0;
  if(rewards){
    (d.promos||[]).forEach(k=>{ecoInvAdd(st,k,1);gained[k]=(gained[k]||0)+1;});
    ecoSetInt(st,'win_streak',res==='win'?ecoInt(st,'win_streak')+1:res==='loss'?0:ecoInt(st,'win_streak'));
    if(res==='win'){
      const per=ecoCat().laurelsPerStep,cap=ecoCat().column.length*per;
      const before=Math.min(cap,ecoInt(st,'col_laurels')),after=Math.min(cap,before+ecoLaurelsFor(d.moves));
      ecoSetInt(st,'col_laurels',after);
      laurels={gain:after-before,laurels:after,steps:Math.floor(after/per),
        opened:Math.floor(after/per)-Math.floor(before/per),moves:d.moves};
    }
    const ev=Object.assign({},d.events||{});
    if(res!=='win')delete ev.mate;
    if(res==='win'){ev.win={'*':1};ev.winwith={};Object.keys(need).forEach(k=>{ev.winwith[k]=1;});}
    ev.promo={};(d.promos||[]).forEach(k=>{ev.promo[k]=(ev.promo[k]||0)+1;});
    earned=ecoQuestsNote(st,ev);
  }
  p.history=(p.history||[]).concat([{result:res,oldElo,newElo,delta,date:Date.now(),aiElo:t.opp_elo,
    ranked:counts,opp:t.opp_name,army:(t.army.extras||[]).slice(),
    replay:reason==='abandon'?null:(d.replay||null),mode:t.mode,why:reason}]).slice(-30);
  const ms=ecoMilestones(st,oldPeak,p.elo_peak|0);
  p.state=st;
  let clan=null;
  if(counts&&reason!=='abandon'){try{clan=hooks.clan(p,res,oldElo,t.opp_elo,t.mode,t.opp_name);}catch(e){clan=null;}}
  t.outcome={result:res,reason,ranked:counts,old_elo:oldElo,new_elo:newElo,delta,clan,
    eco:{lost,returned,gained,streak:ecoInt(st,'win_streak'),laurels,tickets:earned,milestones:ms}};
  t.result=res;t.settled_at=Date.now();t.settle_reason=reason;
  return t.outcome;
}
function ecoMatchPeer(db,t){
  if(t.mode!=='ligne')return null;
  return Object.values(db.matches).filter(c=>c.mode==='ligne'&&c.room===t.room&&c.player_id===t.opp_player
    &&c.opp_player===t.player_id&&Math.abs(c.created_at-t.created_at)<=120000)
    .sort((a,b)=>b.created_at-a.created_at)[0]||null;
}
function ecoMatchGone(db,t){
  const p=db.players[t.player_id];
  return Date.now()-t.created_at>6*3600e3||!p||Date.now()-(p.last_seen_at||0)>90000
    ||Object.values(db.matches).some(n=>n.player_id===t.player_id&&n.created_at>t.created_at);
}
function ecoMatchTry(db,hooks,tid,final){
  const t=db.matches[tid];
  if(!t||t.settled_at)return;
  const A=(id,r,why)=>ecoMatchApply(db,hooks,id,r,why);
  if(t.mode!=='ligne'){
    if(!t.claim){if(final||Date.now()-t.created_at>3*3600e3)A(t.id,'loss','abandon');return;}
    if(t.ranked&&t.claim!=='loss'&&t.claim_at-t.created_at<20000)A(t.id,t.claim,'short');
    else A(t.id,t.claim,'report');
    return;
  }
  const c=ecoMatchPeer(db,t);
  if(!c){
    if(t.claim&&(final||Date.now()-t.created_at>120000))A(t.id,t.claim,'unmatched');
    else if(!t.claim&&(final||Date.now()-t.created_at>6*3600e3))A(t.id,'loss','abandon');
    return;
  }
  if(c.settled_at){
    if(!t.claim&&!final)return;
    A(t.id,ecoWorst(t.claim||ecoResInv(c.result),ecoResInv(c.result)),c.settle_reason==='abandon'?'opp-gone':'agree');
    return;
  }
  if(t.claim&&c.claim){
    const ta=t.claim_data&&t.claim_data.opp_army,ca=c.claim_data&&c.claim_data.opp_army;
    if(ta&&!ecoArmySame(ta,c.army)){A(c.id,'loss','cheat');A(t.id,t.claim,'void');return;}
    if(ca&&!ecoArmySame(ca,t.army)){A(t.id,'loss','cheat');A(c.id,c.claim,'void');return;}
    const rt=ecoWorst(t.claim,ecoResInv(c.claim)),rc=ecoWorst(c.claim,ecoResInv(t.claim));
    const why=(rt===t.claim&&rc===c.claim)?'agree':'conflict';
    A(t.id,rt,why);A(c.id,rc,why);return;
  }
  if(t.claim&&!c.claim&&ecoMatchGone(db,c)){A(c.id,'loss','abandon');A(t.id,ecoWorst(t.claim,'win'),'opp-gone');}
  else if(c.claim&&!t.claim&&(final||ecoMatchGone(db,t))){A(t.id,'loss','abandon');A(c.id,ecoWorst(c.claim,'win'),'opp-gone');}
  else if(!t.claim&&final)A(t.id,'loss','abandon');
}
function ecoMatchSweep(db,hooks,pid,boot){
  Object.values(db.matches).filter(t=>t.player_id===pid&&!t.settled_at)
    .sort((a,b)=>a.created_at-b.created_at).forEach(t=>ecoMatchTry(db,hooks,t.id,boot));
}
function ecoMatchView(db,tid,self){
  const t=db.matches[tid],c=ecoMatchPeer(db,t);
  return Object.assign({ticket:t.id,status:t.settled_at?'settled':'pending',ranked:t.ranked,
    paired:t.mode!=='ligne'||!!c,opp_name:t.opp_name,opp_elo:t.opp_elo},t.outcome||{},{profile:self});
}
function ecoMatchBegin(db,hooks,p,payload){
  payload=payload||{};
  ecoMatchSweep(db,hooks,p.id,true);
  const mode=payload.mode;
  const id=(self.crypto&&self.crypto.randomUUID)?self.crypto.randomUUID():'m-'+Math.random().toString(36).slice(2);
  if(mode==='tuto'){
    db.matches[id]={id,player_id:p.id,mode:'tuto',ranked:false,army:ecoArmyNorm(payload.army),engaged:{},created_at:Date.now()};
    return{ticket:id,ranked:false,army:db.matches[id].army,state:ecoClone(p.state)};
  }
  const st=ecoInit(ecoClone(p.state),p.elo_peak|0);
  const army=ecoArmyCheck(payload.army,st,p.is_admin);
  let ranked=false,oppElo=0,oppName=null,opp=null,ai=null,room=null;
  if(mode==='ia'){
    ai=payload.ai;
    if(!(ai in ecoCat().ai))throw ecoErr('Adversaire inconnu.','22023');
    oppElo=ecoCat().ai[ai];oppName=ai;ranked=!p.is_admin;
  }else if(mode==='ligne'){
    opp=payload.opp;room=String(payload.room||'').slice(0,120);
    if(room.length<8)throw ecoErr('Salon invalide.','22023');
    const o=db.players[opp];
    if(!o||o.id===p.id)throw ecoErr('Adversaire inconnu.','22023');
    oppElo=o.elo|0;oppName=o.username;ranked=!p.is_admin&&!o.is_admin;
  }else throw ecoErr('Mode de partie inconnu.','22023');
  const need=p.is_admin?{}:ecoArmyNeed(army);
  Object.entries(need).forEach(([k,n])=>ecoInvAdd(st,k,-n));
  p.state=st;
  db.matches[id]={id,player_id:p.id,mode,ranked,opp_player:opp,opp_ai:ai,opp_elo:oppElo,opp_name:oppName,
    room,army,engaged:need,created_at:Date.now()};
  return{ticket:id,ranked,opp_elo:oppElo,opp_name:oppName,army,engaged:need,state:ecoClone(st)};
}
function ecoMatchReport(db,hooks,p,payload){
  const t=db.matches[payload&&payload.ticket];
  if(!t||t.player_id!==p.id)throw ecoErr('EC_TICKET: partie inconnue.','P0002');
  if(!['win','loss','draw'].includes(payload.result))throw ecoErr('EC_RESULT: résultat inconnu','22023');
  if(!t.claim&&!t.settled_at){t.claim=payload.result;t.claim_at=Date.now();t.claim_data=ecoClaimClean(t,payload);}
  ecoMatchTry(db,hooks,t.id,false);
}
