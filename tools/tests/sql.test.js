// ================================================================
// TESTS DU SERVEUR : supabase/schema.sql contre un vrai Postgres
// ================================================================
// node --test tools/tests/sql.test.js
//
// Demande `psql` et une base vide joignable avec les variables PG* usuelles
// (PGHOST, PGUSER, PGDATABASE…). En CI, un service Postgres en fournit une
// (.github/workflows/tests.yml). Sans psql, les tests sont sautés.
//
// Le schéma est chargé DEUX FOIS : la seconde vérifie qu'il se rejoue sans
// rien casser — c'est désormais aussi la migration d'une base en service.
const test=require('node:test');
const assert=require('node:assert');
const {execFileSync}=require('child_process');
const path=require('path');
const SCHEMA=path.join(__dirname,'..','..','supabase','schema.sql');

let hasPsql=true;
try{execFileSync('psql',['-At','-c','select 1'],{stdio:'pipe'});}catch(e){hasPsql=false;}
const opts={skip:hasPsql?false:'psql ou base Postgres indisponible'};

function psql(sql){
  return execFileSync('psql',['-At','-v','ON_ERROR_STOP=1','-q'],{input:sql,stdio:['pipe','pipe','pipe']}).toString().trim();
}
// Une fonction ec_* : rend le JSON, ou lève l'erreur Postgres (message).
function rpc(fn,args){
  const lit=v=>v===null||v===undefined?'null':typeof v==='object'?"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb"
    :typeof v==='number'||typeof v==='boolean'?String(v):"'"+String(v).replace(/'/g,"''")+"'";
  try{
    const out=psql('select '+fn+'('+args.map(lit).join(',')+')::text;');
    return out?JSON.parse(out):null;
  }catch(e){
    const msg=String(e.stderr||e.message).match(/ERROR:\s+(.*)/);
    throw new Error(msg?msg[1]:String(e.stderr||e.message));
  }
}
const SECRET='0123456789abcdef0123456789abcdef';
let n=0;
function newPlayer(prefix){
  const name=(prefix||'Joueur')+' '+(++n)+Math.floor(Math.random()*1e6);
  const secret=SECRET+n;
  const p=rpc('ec_signup',[name,secret]);
  return {id:p.id,secret,name,p};
}
const eco=(pl,action,arg)=>rpc('ec_eco',[pl.id,pl.secret,action,arg||{}]);
const setState=(pl,patch)=>psql("update ec_players set state = state || '"+JSON.stringify(patch)+"'::jsonb where id = '"+pl.id+"';");
const setCol=(pl,sql)=>psql("update ec_players set "+sql+" where id = '"+pl.id+"';");
const army={mon:'roi',gen:'dame',extras:['garde-pierre','fourmi','dresseur-elephant'],powers:[]};
const age=(ticket,secs)=>psql("update ec_matches set created_at = created_at - interval '"+secs+" seconds' where id = '"+ticket+"';");

test('le schéma se charge, et se rejoue sans rien détruire',opts,()=>{
  psql('drop schema public cascade; create schema public; grant usage on schema public to public;');
  psql("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;"+
       " if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;");
  execFileSync('psql',['-v','ON_ERROR_STOP=1','-q','-f',SCHEMA],{stdio:'pipe'});
  const a=newPlayer('Avant');
  execFileSync('psql',['-v','ON_ERROR_STOP=1','-q','-f',SCHEMA],{stdio:'pipe'});
  assert.strictEqual(psql("select count(*) from ec_players where id = '"+a.id+"'"),'1');
});

test('pseudos : lettres latines, pas d\'invisibles, pas d\'insultes',opts,()=>{
  const err=nm=>rpc('ec_name_free',[nm]);
  assert.strictEqual(err('Élodie_42').ok,true);
  assert.strictEqual(err('Аdmin').ok,false,'A cyrillique');
  assert.strictEqual(err('Bo​b').ok,false,'espace de largeur nulle');
  assert.strictEqual(err('Grand Connard').ok,false);
  assert.strictEqual(err('fdp').ok,false);
  assert.strictEqual(err('Lepd').ok,true);
});

test('la clé est salée (bcrypt) et une ancienne empreinte est mise à niveau',opts,()=>{
  const a=newPlayer();
  assert.match(psql("select secret_hash from ec_players where id='"+a.id+"'"),/^\$2/);
  psql("update ec_players set secret_hash = ec_hash_legacy('"+a.secret+"') where id='"+a.id+"'");
  rpc('ec_login',[a.id,a.secret]);
  assert.match(psql("select secret_hash from ec_players where id='"+a.id+"'"),/^\$2/);
  assert.throws(()=>rpc('ec_login',[a.id,'mauvaise-cle-mauvaise-cle']),/EC_AUTH/);
});

test('ec_save_state refuse l\'économie et le classement',opts,()=>{
  const a=newPlayer();
  rpc('ec_save_state',[a.id,a.secret,{pearls:99999,inventory:{'grand-maitre':50},armies:[{x:1}],elo:4000}]);
  const st=JSON.parse(psql("select state::text from ec_players where id='"+a.id+"'"));
  assert.notStrictEqual(st.pearls,99999);
  assert.ok(!st.inventory||!st.inventory['grand-maitre']);
  assert.deepStrictEqual(st.armies,[{x:1}]);
  assert.strictEqual(psql("select elo from ec_players where id='"+a.id+"'"),'0');
});

test('le magasin débite les perles et tire le coffre côté serveur',opts,()=>{
  const a=newPlayer();
  assert.throws(()=>eco(a,'shop',{chest:'roi'}),/perles/);
  setState(a,{pearls:200});
  const r=eco(a,'shop',{chest:'pion'});
  assert.strictEqual(r.state.pearls>=200-8,true);
  assert.ok(Array.isArray(r.lots)&&r.lots.length>=1);
  assert.ok(r.lots[0].pearls>=1);
});

test('la récompense journalière ne se prend qu\'une fois par jour',opts,()=>{
  const a=newPlayer();
  const r=eco(a,'daily');
  assert.strictEqual(r.state.dr_idx,1);
  assert.throws(()=>eco(a,'daily'),/déjà/);
});

test('le tutoriel donne ses trois créatures une seule fois',opts,()=>{
  const a=newPlayer();
  const r=eco(a,'tuto');
  assert.strictEqual(r.lots.length,3);
  assert.ok(r.state.unlocked_pieces.includes('fourmi'));
  assert.ok(r.state.unlocked_powers.includes('fourmi'));
  assert.strictEqual(eco(a,'tuto').lots.length,0);
});

test('une partie contre le laboratoire : billet, pièces engagées, règlement',opts,()=>{
  const a=newPlayer();eco(a,'tuto');
  const b=rpc('ec_match_begin',[a.id,a.secret,{mode:'ia',ai:'cendre',army}]);
  assert.strictEqual(b.ranked,true);
  assert.strictEqual(b.opp_elo,150);
  assert.strictEqual(b.state.inventory.fourmi,4,'deux fourmis engagées sur six');
  // Trop court : ne compte pas.
  const short=rpc('ec_report_match',[a.id,a.secret,{ticket:b.ticket,result:'win',survivors:{fourmi:2}}]);
  assert.strictEqual(short.reason,'short');
  assert.strictEqual(short.delta,0);
  const b2=rpc('ec_match_begin',[a.id,a.secret,{mode:'ia',ai:'instructeur',army}]);
  age(b2.ticket,60);
  const r=rpc('ec_report_match',[a.id,a.secret,{ticket:b2.ticket,result:'win',moves:12,
    survivors:{fourmi:2,'garde-pierre':2,roi:1,dame:1,'dresseur-elephant':5}}]);
  assert.strictEqual(r.status,'settled');
  assert.ok(r.delta>0,'une victoire contre 2000 ELO rapporte');
  assert.strictEqual(r.eco.returned['dresseur-elephant'],2,'les survivantes sont bornées par l\'engagement');
  assert.strictEqual(r.eco.laurels.gain,9);
  // Un second rapport ne refait rien.
  const again=rpc('ec_report_match',[a.id,a.secret,{ticket:b2.ticket,result:'win'}]);
  assert.strictEqual(again.new_elo,r.new_elo);
});

test('un billet laissé ouvert est un abandon au retour',opts,()=>{
  const a=newPlayer();eco(a,'tuto');
  const b=rpc('ec_match_begin',[a.id,a.secret,{mode:'ia',ai:'instructeur',army}]);
  setCol(a,'elo = 500, elo_peak = 500, ranked_games = 30');
  rpc('ec_login',[a.id,a.secret]);
  const row=JSON.parse(psql("select row_to_json(m)::text from ec_matches m where id='"+b.ticket+"'"));
  assert.strictEqual(row.result,'loss');
  assert.strictEqual(row.settle_reason,'abandon');
  assert.ok(Number(psql("select elo from ec_players where id='"+a.id+"'"))<500);
});

test('l\'armée doit être possédée, et ses pouvoirs éveillés',opts,()=>{
  const a=newPlayer();
  assert.throws(()=>rpc('ec_match_begin',[a.id,a.secret,{mode:'ia',ai:'cendre',army}]),/Stock insuffisant|créature/);
  eco(a,'tuto');
  const gm={mon:'roi',gen:'grand-maitre',extras:['garde-pierre','fourmi','dresseur-elephant']};
  assert.throws(()=>rpc('ec_match_begin',[a.id,a.secret,{mode:'ia',ai:'cendre',army:gm}]),/Stock insuffisant/);
  const b=rpc('ec_match_begin',[a.id,a.secret,{mode:'ia',ai:'cendre',army:{...army,powers:['fourmi','typhon']}}]);
  assert.deepStrictEqual(b.army.powers,['fourmi']);
});

test('en ligne : le résultat est confronté, mentir ne rapporte rien',opts,()=>{
  const a=newPlayer('Alpha'),c=newPlayer('Gamma');eco(a,'tuto');eco(c,'tuto');
  setCol(a,'elo = 800, elo_peak = 800, ranked_games = 30');
  setCol(c,'elo = 800, elo_peak = 800, ranked_games = 30');
  const room='q-'+Date.now()+'abcdef';
  const ta=rpc('ec_match_begin',[a.id,a.secret,{mode:'ligne',opp:c.id,room,army}]);
  const tc=rpc('ec_match_begin',[c.id,c.secret,{mode:'ligne',opp:a.id,room,army}]);
  assert.strictEqual(ta.opp_name,c.name,'le nom adverse vient de la base');
  assert.strictEqual(ta.opp_elo,800);
  // Les deux prétendent avoir gagné : les deux perdent.
  const ra=rpc('ec_report_match',[a.id,a.secret,{ticket:ta.ticket,result:'win',opp_army:army}]);
  assert.strictEqual(ra.status,'pending');
  const rc=rpc('ec_report_match',[c.id,c.secret,{ticket:tc.ticket,result:'win',opp_army:army}]);
  assert.strictEqual(rc.result,'loss');
  assert.strictEqual(rc.reason,'conflict');
  assert.strictEqual(rpc('ec_match_status',[a.id,a.secret,ta.ticket]).result,'loss');
});

test('en ligne : accord, et armée adverse non conforme',opts,()=>{
  const a=newPlayer('Delta'),c=newPlayer('Epsilon');eco(a,'tuto');eco(c,'tuto');
  const room='q-'+Date.now()+'ghijkl';
  const ta=rpc('ec_match_begin',[a.id,a.secret,{mode:'ligne',opp:c.id,room,army}]);
  const tc=rpc('ec_match_begin',[c.id,c.secret,{mode:'ligne',opp:a.id,room,army}]);
  rpc('ec_report_match',[a.id,a.secret,{ticket:ta.ticket,result:'win',opp_army:army}]);
  const rc=rpc('ec_report_match',[c.id,c.secret,{ticket:tc.ticket,result:'loss',opp_army:army}]);
  assert.strictEqual(rc.result,'loss');assert.strictEqual(rc.reason,'agree');
  assert.strictEqual(rpc('ec_match_status',[a.id,a.secret,ta.ticket]).result,'win');
  // Revanche : c a vu une armée que a n'a pas fait vérifier.
  const ta2=rpc('ec_match_begin',[a.id,a.secret,{mode:'ligne',opp:c.id,room:room+':1',army}]);
  const tc2=rpc('ec_match_begin',[c.id,c.secret,{mode:'ligne',opp:a.id,room:room+':1',army}]);
  rpc('ec_report_match',[a.id,a.secret,{ticket:ta2.ticket,result:'win',opp_army:army}]);
  const seen={...army,gen:'grand-maitre'};
  const r2=rpc('ec_report_match',[c.id,c.secret,{ticket:tc2.ticket,result:'loss',opp_army:seen}]);
  assert.strictEqual(r2.reason,'void');
  assert.strictEqual(rpc('ec_match_status',[a.id,a.secret,ta2.ticket]).reason,'cheat');
});

test('en ligne : celui qui part perd, celui qui reste gagne',opts,()=>{
  const a=newPlayer('Zeta'),c=newPlayer('Eta');eco(a,'tuto');eco(c,'tuto');
  const room='q-'+Date.now()+'mnopqr';
  const ta=rpc('ec_match_begin',[a.id,a.secret,{mode:'ligne',opp:c.id,room,army}]);
  rpc('ec_match_begin',[c.id,c.secret,{mode:'ligne',opp:a.id,room,army}]);
  const ra=rpc('ec_report_match',[a.id,a.secret,{ticket:ta.ticket,result:'win',opp_army:army}]);
  assert.strictEqual(ra.status,'pending');
  setCol(c,"last_seen_at = now() - interval '5 minutes'");
  const st=rpc('ec_match_status',[a.id,a.secret,ta.ticket]);
  assert.strictEqual(st.result,'win');assert.strictEqual(st.reason,'opp-gone');
  assert.strictEqual(psql("select (history->-1->>'result') from ec_players where id='"+c.id+"'"),'loss');
});

test('un adversaire inventé ne classe rien',opts,()=>{
  const a=newPlayer('Theta'),c=newPlayer('Iota');eco(a,'tuto');
  const ta=rpc('ec_match_begin',[a.id,a.secret,{mode:'ligne',opp:c.id,room:'q-fantome-'+Date.now(),army}]);
  rpc('ec_report_match',[a.id,a.secret,{ticket:ta.ticket,result:'win'}]);
  age(ta.ticket,600);
  const st=rpc('ec_match_status',[a.id,a.secret,ta.ticket]);
  assert.strictEqual(st.reason,'unmatched');assert.strictEqual(st.delta,0);
});

test('les fonctions internes sont fermées au public',opts,()=>{
  const open=psql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"+
    " where n.nspname='public' and p.proname like 'ec\\_%' and has_function_privilege('anon', p.oid, 'execute')");
  const allowed=new Set(['ec_name_free','ec_signup','ec_login','ec_rotate_secret','ec_touch','ec_rename','ec_delete','ec_save_state',
    'ec_eco','ec_match_begin','ec_report_match','ec_match_status','ec_leaderboard','ec_search','ec_profile',
    'ec_clan_create','ec_clan_edit','ec_clan_join','ec_clan_answer','ec_clan_leave','ec_clan_kick','ec_clan_role',
    'ec_clan_cry','ec_clan_claim','ec_clan_mine','ec_clan_view','ec_clan_list','ec_clan_war']);
  const extra=open.split(',').filter(x=>x&&!allowed.has(x));
  assert.deepStrictEqual(extra,[]);
});

test('la recherche échappe _ et %',opts,()=>{
  newPlayer('Axb');
  const r=rpc('ec_search',['a_b',20]);
  assert.ok(r.every(x=>/a_b/i.test(x.username)));
});

test('colonne des victoires, jokers, rangée de la richesse, réappro, éveil',opts,()=>{
  const a=newPlayer('Kappa');eco(a,'tuto');
  assert.throws(()=>eco(a,'column'),/Aucun palier/);
  setState(a,{col_laurels:15,tickets:10,jokers:0,debris:{'garde-pierre':9}});
  const c1=eco(a,'column');assert.deepStrictEqual(c1.step.chest,'pion');
  eco(a,'column');
  const c3=eco(a,'column');assert.strictEqual(c3.step.jokers,3);
  assert.throws(()=>eco(a,'column'),/Aucun palier/);
  assert.throws(()=>eco(a,'joker',{piece:'roi'}),/ne peut pas/);
  const j=eco(a,'joker',{piece:'fourmi'});assert.strictEqual(j.qty,3);
  const w=eco(a,'wealth');assert.strictEqual(w.pearls,2);assert.strictEqual(w.state.tickets,7);
  setState(a,{inventory:{fourmi:1,'garde-pierre':10,'dresseur-elephant':9,roi:6,dame:6}});
  const r=eco(a,'restock');
  assert.strictEqual(r.gains.fourmi,2);assert.ok(!r.gains['garde-pierre']);assert.strictEqual(r.gains['dresseur-elephant'],1);
  assert.throws(()=>eco(a,'restock'),/déjà/);
  setState(a,{unlocked_powers:[]});
  const aw=eco(a,'awaken',{piece:'garde-pierre'});
  assert.ok(aw.state.unlocked_powers.includes('garde-pierre'));assert.strictEqual(aw.state.debris['garde-pierre'],1);
});

test('quêtes et jalons de la Diagonale au règlement',opts,()=>{
  const a=newPlayer('Lambda');eco(a,'tuto');
  setState(a,{quests:[{id:'move',pieceId:'fourmi',prog:0,done:false},{id:'wins',pieceId:null,prog:2,done:false}],tickets:0});
  setCol(a,'elo = 20, elo_peak = 20, ranked_games = 30');
  const b=rpc('ec_match_begin',[a.id,a.secret,{mode:'ia',ai:'instructeur',army}]);
  age(b.ticket,60);
  const r=rpc('ec_report_match',[a.id,a.secret,{ticket:b.ticket,result:'win',moves:40,
    events:{move:{fourmi:7,typhon:3}}}]);
  assert.strictEqual(r.eco.tickets,2+4,'déplacer 5 fois la fourmi, et la 3e victoire');
  assert.ok(r.eco.milestones.some(m=>m.id==='rw-25'),'le jalon de 25 ELO est franchi');
  const st=JSON.parse(psql("select state::text from ec_players where id='"+a.id+"'"));
  assert.ok(st.voie_chests.includes('ch-30')||r.new_elo<30);
  if(st.voie_chests.includes('ch-30')){
    const v=eco(a,'voie',{milestone:'ch-30'});assert.ok(v.lots.length>=1);
    assert.throws(()=>eco(a,'voie',{milestone:'ch-30'}),/pas à vous/);
  }
});

test('le code de secours change, et l\'ancien ne sert plus',opts,()=>{
  const a=newPlayer('Mu');
  const fresh='fedcba9876543210fedcba9876543210';
  rpc('ec_rotate_secret',[a.id,a.secret,fresh]);
  assert.throws(()=>rpc('ec_login',[a.id,a.secret]),/EC_AUTH/);
  assert.strictEqual(rpc('ec_login',[a.id,fresh]).id,a.id);
});

test('pas plus de vingt comptes par heure et par adresse',opts,()=>{
  const sql=i=>"select set_config('request.headers','{\"x-forwarded-for\":\"203.0.113.9\"}',false);"+
    "select ec_signup('Bot Num "+i+"','"+SECRET+"');";
  for(let i=0;i<20;i++)psql(sql(i));
  assert.throws(()=>psql(sql(20)),/Trop de comptes/);
});

test('le butin de clan s\'ouvre au serveur, une fois',opts,()=>{
  const a=newPlayer('Nu');eco(a,'tuto');
  setCol(a,'ranked_games = 5');
  const tag='T'+String(n).padStart(2,'0');
  const mine=rpc('ec_clan_create',[a.id,a.secret,'Clan '+n+'x'+Math.floor(Math.random()*1e5),tag,{},0,'open',0]);
  const clan=mine.clan.id;
  const last="ec_week_key(now() - interval '7 days')";
  psql("insert into ec_clan_weeks(clan_id, week_key, points, wins, games) values ('"+clan+"', "+last+", 50, 3, 5);"+
       "insert into ec_clan_contrib(player_id, week_key, clan_id, points) values ('"+a.id+"', "+last+", '"+clan+"', 50);");
  const r=rpc('ec_clan_claim',[a.id,a.secret]);
  assert.ok(Array.isArray(r.lots)&&r.lots.length>=1);
  assert.ok(r.state&&r.state.pearls>0);
  assert.throws(()=>rpc('ec_clan_claim',[a.id,a.secret]),/déjà/);
});
