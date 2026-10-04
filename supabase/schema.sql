-- =================================================================
-- EPIC CHESS — LE SERVEUR FAIT AUTORITÉ
-- =================================================================
-- À COLLER EN ENTIER dans l'éditeur SQL du projet Supabase
-- (Dashboard > SQL Editor > New query > Run).
--
-- CE SCRIPT NE DÉTRUIT RIEN, ET SE REJOUE À VOLONTÉ. Il commençait par
-- effacer la table des joueurs : le rejouer pour mettre à jour une seule
-- fonction supprimait tous les comptes, et un oubli suffisait. Il ne fait
-- plus que créer ce qui manque (tables, colonnes, index) et remplacer les
-- fonctions. C'est donc AUSSI la migration : pour mettre à jour une base en
-- service, on recolle ce fichier, rien d'autre.
-- La remise à zéro complète, elle, est un geste à part et assumé :
-- supabase/reset.sql.
--
-- -- CE QUE CE FICHIER GARANTIT ------------------------------------
--
-- 1. AUCUN ACCÈS DIRECT AUX TABLES. RLS est activé et il n'existe AUCUNE
--    policy : la clé publishable du jeu ne peut ni lire ni écrire une
--    ligne. Tout passe par les fonctions ec_* exposées en bas de fichier
--    (DROITS), déclarées SECURITY DEFINER, qui valident tout ce qui les
--    traverse. Toutes les autres fonctions sont fermées au public.
--
-- 2. LE CLIENT NE DÉCLARE PLUS SON CLASSEMENT NI SES RICHESSES.
--    · Une partie s'ouvre au serveur (ec_match_begin) : c'est LUI qui lit
--      l'ELO et le nom de l'adversaire, décide si elle est classée, vérifie
--      que l'armée est possédée, et retire les pièces engagées.
--    · Elle se clôt au serveur (ec_report_match). En ligne, le résultat
--      n'est retenu que confronté à celui de l'adversaire ; une partie
--      quittée ou rechargée est une défaite.
--    · L'économie entière — coffres, perles, jokers, débris, tickets,
--      quêtes, colonne des victoires, jalons — est tirée et tenue ici.
--      ec_save_state refuse ces clés.
--
-- 3. LES PSEUDOS SONT UNIQUES POUR TOUT LE MONDE, en lettres latines, sans
--    caractère invisible ni mot interdit (ec_name_error).
--
-- 4. LES COMPTES ADMIN NE SONT JAMAIS CLASSÉS, et une partie contre un
--    admin ne l'est pour personne. Pour promouvoir un compte :
--      update ec_players set is_admin = true where username_key = 'mon pseudo';
--
-- 5. QUI EST EN LIGNE. Le jeu bat la mesure toutes les 30 s (ec_touch).
--    « En ligne » = vu il y a moins de ec_online_window().
-- =================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------
-- LA TABLE DES JOUEURS
-- -----------------------------------------------------------------
-- Les colonnes nommées appartiennent au SERVEUR. `state` porte la
-- progression : une partie (armées, réglages, tutoriel, amis…) est pilotée
-- par le client via ec_save_state ; l'autre (l'économie, ECO_KEYS plus bas)
-- n'est écrite que par les fonctions de ce fichier.
create table if not exists public.ec_players(
  id            uuid primary key default gen_random_uuid(),
  username      text        not null,
  username_key  text        not null unique,
  secret_hash   text        not null,
  is_admin      boolean     not null default false,
  elo           integer     not null default 0,
  elo_peak      integer     not null default 0,
  ranked_games  integer     not null default 0,
  ranked_wins   integer     not null default 0,
  ranked_draws  integer     not null default 0,
  best_streak   integer     not null default 0,
  cur_streak    integer     not null default 0,
  piece_stats   jsonb       not null default '{}'::jsonb,
  history       jsonb       not null default '[]'::jsonb,
  state         jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists ec_players_elo_idx  on public.ec_players(elo desc, ranked_games desc, created_at);
create index if not exists ec_players_seen_idx on public.ec_players(last_seen_at desc);
-- Le classement ne lit que les comptes classés : un index qui ne porte
-- qu'eux, dans l'ordre du tableau.
create index if not exists ec_players_board_idx on public.ec_players(elo desc, ranked_games desc, created_at)
  where not is_admin and ranked_games > 0;
-- La recherche par morceau de pseudo (« %bob% ») : sans index trigramme,
-- elle relisait toute la table à chaque frappe.
create index if not exists ec_players_name_trgm on public.ec_players using gin (username_key gin_trgm_ops);

alter table public.ec_players enable row level security;
revoke all on public.ec_players from anon, authenticated;

-- -----------------------------------------------------------------
-- LES PARTIES : un billet par joueur et par partie
-- -----------------------------------------------------------------
-- Ouvert par ec_match_begin AVANT le premier coup, clos par
-- ec_report_match (ou par un abandon constaté). Un billet porte ce que le
-- serveur a décidé à l'ouverture — adversaire, ELO adverse, classée ou
-- non, armée vérifiée, pièces engagées — et ce que le joueur a déclaré à
-- la fin. En ligne, les deux billets d'une même partie se retrouvent par
-- leur salon (`room`), et c'est leur confrontation qui décide.
create table if not exists public.ec_matches(
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid        not null references public.ec_players(id) on delete cascade,
  mode          text        not null,              -- ia | ligne | tuto
  ranked        boolean     not null default false,
  opp_player    uuid,                              -- en ligne : le compte adverse
  opp_ai        text,                              -- contre le laboratoire : son id
  opp_elo       integer     not null default 0,
  opp_name      text,
  room          text,
  army          jsonb       not null default '{}'::jsonb,
  engaged       jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  claim         text,                              -- win | loss | draw, tel que déclaré
  claim_at      timestamptz,
  claim_data    jsonb,
  result        text,                              -- l'issue retenue
  settled_at    timestamptz,
  settle_reason text,
  outcome       jsonb                              -- ce que le règlement a produit
);
create index if not exists ec_matches_open_idx on public.ec_matches(player_id) where settled_at is null;
create index if not exists ec_matches_room_idx on public.ec_matches(room) where room is not null;
create index if not exists ec_matches_old_idx  on public.ec_matches(created_at);
alter table public.ec_matches enable row level security;
revoke all on public.ec_matches from anon, authenticated;

-- -----------------------------------------------------------------
-- LE COMPTEUR DE DÉBIT
-- -----------------------------------------------------------------
-- Une ligne par geste compté (création de compte par adresse IP, partie
-- ouverte par joueur…). ec_rate_hit refuse au-delà du plafond de la
-- fenêtre ; les lignes de plus d'un jour sont balayées au passage.
create table if not exists public.ec_rate(
  key text        not null,
  at  timestamptz not null default now()
);
create index if not exists ec_rate_idx on public.ec_rate(key, at desc);
alter table public.ec_rate enable row level security;
revoke all on public.ec_rate from anon, authenticated;

-- -----------------------------------------------------------------
-- LES TABLES DES CLANS
-- -----------------------------------------------------------------
-- Toutes fermées comme ec_players : RLS actif, aucune policy. Un clan
-- se lit et s'écrit par les fonctions ec_clan_*, jamais par la table.
create table if not exists public.ec_clans(
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  name_key     text        not null unique,
  tag          text        not null unique,
  blazon       jsonb       not null default '{}'::jsonb,
  motto        integer     not null default 0,
  recruit      text        not null default 'open',
  min_elo      integer     not null default 0,
  points_total bigint      not null default 0,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

-- UN JOUEUR, UN CLAN : la clé primaire est le joueur. Être dans deux
-- clans à la fois n'est pas une règle qu'on vérifie, c'est une ligne
-- qu'on ne peut pas écrire.
create table if not exists public.ec_clan_members(
  player_id    uuid primary key references public.ec_players(id) on delete cascade,
  clan_id      uuid        not null references public.ec_clans(id) on delete cascade,
  role         text        not null default 'membre',
  joined_at    timestamptz not null default now(),
  points_total bigint      not null default 0,
  day_key      date,
  day_points   integer     not null default 0,
  last_cry_at  timestamptz
);
create index if not exists ec_clan_members_clan_idx on public.ec_clan_members(clan_id);

-- Le score d'un clan pour UNE semaine de guerre.
create table if not exists public.ec_clan_weeks(
  clan_id  uuid    not null references public.ec_clans(id) on delete cascade,
  week_key text    not null,
  points   integer not null default 0,
  wins     integer not null default 0,
  games    integer not null default 0,
  primary key(clan_id, week_key)
);
create index if not exists ec_clan_weeks_week_idx on public.ec_clan_weeks(week_key, points desc);

-- CE QU'UN JOUEUR A RAPPORTÉ À QUEL CLAN, SEMAINE PAR SEMAINE. C'est
-- elle, et non l'appartenance du moment, qui ouvre le butin : changer de
-- clan le dimanche soir pour rejoindre le premier ne rapporte rien, on
-- est payé par le clan pour lequel on a combattu.
create table if not exists public.ec_clan_contrib(
  player_id uuid    not null references public.ec_players(id) on delete cascade,
  week_key  text    not null,
  clan_id   uuid    not null references public.ec_clans(id) on delete cascade,
  points    integer not null default 0,
  primary key(player_id, week_key, clan_id)
);

-- Le journal du clan : un fil, pas une archive (60 lignes par clan).
create table if not exists public.ec_clan_events(
  id      bigserial   primary key,
  clan_id uuid        not null references public.ec_clans(id) on delete cascade,
  at      timestamptz not null default now(),
  kind    text        not null,
  data    jsonb       not null default '{}'::jsonb
);
create index if not exists ec_clan_events_clan_idx on public.ec_clan_events(clan_id, id desc);

create table if not exists public.ec_clan_requests(
  clan_id   uuid        not null references public.ec_clans(id) on delete cascade,
  player_id uuid        not null references public.ec_players(id) on delete cascade,
  at        timestamptz not null default now(),
  primary key(clan_id, player_id)
);

-- UN BUTIN PAR JOUEUR ET PAR SEMAINE : la clé primaire le garantit, même
-- si deux onglets réclament à la même milliseconde.
create table if not exists public.ec_clan_claims(
  player_id  uuid        not null references public.ec_players(id) on delete cascade,
  week_key   text        not null,
  chest      text        not null,
  rank       integer,
  claimed_at timestamptz not null default now(),
  primary key(player_id, week_key)
);

alter table public.ec_clans         enable row level security;
alter table public.ec_clan_members  enable row level security;
alter table public.ec_clan_weeks    enable row level security;
alter table public.ec_clan_contrib  enable row level security;
alter table public.ec_clan_events   enable row level security;
alter table public.ec_clan_requests enable row level security;
alter table public.ec_clan_claims   enable row level security;
revoke all on public.ec_clans, public.ec_clan_members, public.ec_clan_weeks,
  public.ec_clan_contrib, public.ec_clan_events, public.ec_clan_requests,
  public.ec_clan_claims from anon, authenticated;


-- -----------------------------------------------------------------
-- LE CATALOGUE DU JEU
-- -----------------------------------------------------------------
-- Pièces, coffres, paliers, quêtes : recopiés des fichiers du jeu par
-- tools/gen-catalogue.js. ec_cat() rend tout en un seul objet JSON.
-- <catalogue>
-- ENGENDRÉ PAR tools/gen-catalogue.js À PARTIR DES FICHIERS DU JEU : ne pas
-- modifier à la main, relancer le script.
create or replace function public.ec_cat() returns jsonb
language sql immutable parallel safe as $$ select '{"pieces":{"roi":{"name":"Roi","cls":"Monarque","value":3,"qty":1,"type":"k","power":false,"arena":0},"matriarche":{"name":"Matriarche","cls":"Monarque","value":3,"qty":1,"type":"k","power":true,"arena":1},"imperator":{"name":"Empereur","cls":"Monarque","value":7,"qty":1,"type":"k","power":false,"arena":3},"amazone":{"name":"Amazone","cls":"Général","value":7,"qty":1,"type":"q","power":false,"arena":1},"chevaucheur-rhinoceros":{"name":"Centaure","cls":"Général","value":8,"qty":1,"type":"r","power":false,"arena":0},"dame":{"name":"Dame","cls":"Général","value":10,"qty":1,"type":"q","power":false,"arena":0},"grand-maitre":{"name":"Grand Maître","cls":"Général","value":13,"qty":1,"type":"q","power":true,"arena":5},"nyx":{"name":"Nyx","cls":"Général","value":9,"qty":1,"type":"q","power":true,"arena":4},"cavalier-primordial":{"name":"Cavalier Primordial","cls":"Primordiale","value":3,"qty":2,"type":"n","power":false,"arena":0},"fou-primordial":{"name":"Fou Primordial","cls":"Primordiale","value":3,"qty":2,"type":"b","power":false,"arena":0},"tour-primordiale":{"name":"Tour Primordiale","cls":"Primordiale","value":5,"qty":2,"type":"r","power":false,"arena":0},"fourmi":{"name":"Fourmi","cls":"Brute","value":2,"qty":2,"type":"p","power":true,"arena":0},"preux-chevalier":{"name":"Preux Chevalier","cls":"Brute","value":3,"qty":2,"type":"r","power":true,"arena":0},"dresseur-elephant":{"name":"Éléphant de guerre","cls":"Brute","value":3,"qty":2,"type":"r","power":true,"arena":0},"garde-pierre":{"name":"Garde de Pierre","cls":"Brute","value":3,"qty":2,"type":"p","power":true,"arena":0},"meduse":{"name":"Méduse","cls":"Sorcier","value":2,"qty":2,"type":"p","power":true,"arena":1},"typhon":{"name":"Typhon","cls":"Sorcier","value":6,"qty":2,"type":"b","power":true,"arena":3},"banshee":{"name":"Banshee","cls":"Sorcier","value":4,"qty":2,"type":"b","power":true,"arena":3},"pretre":{"name":"Prêtre","cls":"Sorcier","value":4,"qty":2,"type":"r","power":true,"arena":3},"pegase":{"name":"Pégase","cls":"Brute","value":5,"qty":2,"type":"n","power":false,"arena":4},"loup-geant":{"name":"Loup Géant","cls":"Brute","value":2,"qty":2,"type":"b","power":false,"arena":1},"singe":{"name":"Singe","cls":"Brute","value":4,"qty":2,"type":"b","power":true,"arena":2},"infecte":{"name":"Infecté","cls":"Sorcier","value":4,"qty":2,"type":"n","power":true,"arena":1},"ombre":{"name":"Ombre","cls":"Sorcier","value":3,"qty":2,"type":"r","power":true,"arena":2},"illusion":{"name":"Illusion","cls":"Sorcier","value":5,"qty":2,"type":"q","power":true,"arena":5},"berserk":{"name":"Berserk","cls":"Brute","value":4,"qty":2,"type":"r","power":true,"arena":2},"boucher":{"name":"Boucher","cls":"Brute","value":4,"qty":2,"type":"r","power":true,"arena":3}},"free":["std-r","std-n","std-b","std-pawn","pion-mercenaire","pion-legionnaire","pion-barbare"],"ranks":[{"id":"bois","min":0},{"id":"pierre","min":200},{"id":"bronze","min":500},{"id":"acier","min":800},{"id":"obsidienne","min":1200},{"id":"argent","min":1500},{"id":"or","min":2000}],"chests":{"pion":{"tier":0,"rolls":2,"total":[1,3],"newChance":0.06,"bias":0.6,"debris":{"p":0.3,"n":[1,1]},"pearls":[1,3],"price":8},"cavalier":{"tier":1,"rolls":3,"total":[3,5],"newChance":0.1,"bias":0.9,"debris":{"p":0.45,"n":[1,2]},"pearls":[3,5],"price":16},"fou":{"tier":2,"rolls":3,"total":[5,8],"newChance":0.15,"bias":1.25,"debris":{"p":0.6,"n":[2,3]},"pearls":[5,8],"price":26},"tour":{"tier":3,"rolls":4,"total":[8,12],"newChance":0.22,"bias":1.8,"debris":{"p":0.75,"n":[2,4]},"pearls":[8,12],"price":40},"dame":{"tier":4,"rolls":5,"total":[12,20],"newChance":0.32,"bias":2.4,"debris":{"p":1,"n":[3,5]},"pearls":[12,20],"price":64},"roi":{"tier":5,"rolls":6,"total":[20,30],"newChance":0.5,"bias":3.3,"debris":{"p":1,"n":[5,8]},"pearls":[20,30],"price":100}},"chestPity":5,"debrisNeeded":8,"restock":{"perPiece":2,"cap":10},"daily":[{"chest":"pion"},{"pearls":10},{"chest":"cavalier"},{"chest":"pion"},{"jokers":5},{"chest":"fou"},{"chest":"tour"},{"pearls":10},{"chest":"pion"},{"jokers":5},{"chest":"cavalier"},{"chest":"pion"},{"pearls":10},{"chest":"fou"},{"chest":"tour"},{"jokers":5}],"starterStock":6,"starterPieces":["roi","dame"],"milestones":[{"id":"rw-25","elo":25,"reward":"pearls","chest":null,"amount":6,"copyId":null,"qty":null},{"id":"ch-30","elo":30,"reward":"chest","chest":"pion","amount":null,"copyId":null,"qty":null},{"id":"ch-50","elo":50,"reward":"chest","chest":"cavalier","amount":null,"copyId":null,"qty":null},{"id":"ch-75","elo":75,"reward":"chest","chest":"pion","amount":null,"copyId":null,"qty":null},{"id":"rw-100","elo":100,"reward":"chest","chest":"cavalier","amount":null,"copyId":null,"qty":null},{"id":"ch-150","elo":150,"reward":"chest","chest":"cavalier","amount":null,"copyId":null,"qty":null},{"id":"rw-180","elo":180,"reward":"pearls","chest":null,"amount":8,"copyId":null,"qty":null},{"id":"ch-210","elo":210,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"ch-260","elo":260,"reward":"chest","chest":"cavalier","amount":null,"copyId":null,"qty":null},{"id":"ch-290","elo":290,"reward":"chest","chest":"pion","amount":null,"copyId":null,"qty":null},{"id":"rw-320","elo":320,"reward":"chest","chest":"cavalier","amount":null,"copyId":null,"qty":null},{"id":"ch-360","elo":360,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"rw-400","elo":400,"reward":"pearls","chest":null,"amount":10,"copyId":null,"qty":null},{"id":"ch-450","elo":450,"reward":"chest","chest":"cavalier","amount":null,"copyId":null,"qty":null},{"id":"rw-480","elo":480,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"ch-520","elo":520,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"rw-550","elo":550,"reward":"chest","chest":"cavalier","amount":null,"copyId":null,"qty":null},{"id":"ch-620","elo":620,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"rw-700","elo":700,"reward":"pearls","chest":null,"amount":12,"copyId":null,"qty":null},{"id":"ch-740","elo":740,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"ch-800","elo":800,"reward":"chest","chest":"tour","amount":null,"copyId":null,"qty":null},{"id":"ch-860","elo":860,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"rw-900","elo":900,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"ch-1000","elo":1000,"reward":"chest","chest":"dame","amount":null,"copyId":null,"qty":null},{"id":"rw-1080","elo":1080,"reward":"pearls","chest":null,"amount":14,"copyId":null,"qty":null},{"id":"ch-1100","elo":1100,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"ch-1150","elo":1150,"reward":"chest","chest":"tour","amount":null,"copyId":null,"qty":null},{"id":"ch-1250","elo":1250,"reward":"chest","chest":"tour","amount":null,"copyId":null,"qty":null},{"id":"rw-1300","elo":1300,"reward":"chest","chest":"fou","amount":null,"copyId":null,"qty":null},{"id":"ch-1350","elo":1350,"reward":"chest","chest":"tour","amount":null,"copyId":null,"qty":null},{"id":"rw-1450","elo":1450,"reward":"pearls","chest":null,"amount":16,"copyId":null,"qty":null},{"id":"ch-1500","elo":1500,"reward":"chest","chest":"dame","amount":null,"copyId":null,"qty":null},{"id":"rw-1600","elo":1600,"reward":"chest","chest":"tour","amount":null,"copyId":null,"qty":null},{"id":"ch-1700","elo":1700,"reward":"chest","chest":"dame","amount":null,"copyId":null,"qty":null},{"id":"rw-1850","elo":1850,"reward":"pearls","chest":null,"amount":18,"copyId":null,"qty":null},{"id":"ch-2000","elo":2000,"reward":"chest","chest":"roi","amount":null,"copyId":null,"qty":null}],"legacyUnlocks":{"fourmi":30,"preux-chevalier":50,"dresseur-elephant":75,"chevaucheur-rhinoceros":150,"meduse":210,"amazone":260,"matriarche":290,"loup-geant":360,"infecte":450,"berserk":520,"singe":620,"ombre":740,"pretre":800,"boucher":860,"typhon":1000,"imperator":1100,"banshee":1150,"pegase":1250,"nyx":1350,"illusion":1500,"grand-maitre":1700},"retired":["garde-eau","garde-feu","empereur"],"column":[{"chest":"pion"},{"chest":"pion"},{"jokers":3},{"chest":"cavalier"},{"chest":"pion"},{"chest":"cavalier"},{"chest":"pion"},{"chest":"pion"},{"chest":"fou"},{"chest":"pion"},{"chest":"pion"},{"chest":"cavalier"},{"jokers":5},{"chest":"pion"},{"chest":"tour"},{"chest":"pion"},{"chest":"cavalier"},{"chest":"pion"},{"chest":"pion"},{"jokers":10},{"chest":"pion"},{"chest":"dame"},{"chest":"cavalier"},{"chest":"pion"},{"chest":"fou"},{"chest":"pion"},{"jokers":15},{"chest":"pion"},{"chest":"tour"},{"chest":"roi"}],"laurelsPerStep":5,"laurelScale":[{"upTo":10,"laurels":10},{"upTo":15,"laurels":9},{"upTo":20,"laurels":8},{"upTo":30,"laurels":7},{"upTo":50,"laurels":6}],"laurelsFloor":5,"wealth":[{"pearls":2,"cost":3},{"pearls":2,"cost":3},{"pearls":2,"cost":3},{"pearls":2,"cost":3},{"pearls":2,"cost":3},{"pearls":3,"cost":4},{"pearls":3,"cost":4},{"pearls":3,"cost":4},{"pearls":3,"cost":4},{"pearls":3,"cost":4},{"pearls":4,"cost":5},{"pearls":4,"cost":5},{"pearls":4,"cost":5},{"pearls":4,"cost":5},{"pearls":4,"cost":5},{"pearls":5,"cost":6},{"pearls":5,"cost":6},{"pearls":5,"cost":6},{"pearls":5,"cost":6},{"pearls":5,"cost":6},{"pearls":6,"cost":8},{"pearls":6,"cost":8},{"pearls":6,"cost":8},{"pearls":6,"cost":8},{"pearls":6,"cost":8}],"quests":[{"id":"mate","event":"mate","piece":true,"target":1,"tickets":5},{"id":"check","event":"check","piece":true,"target":3,"tickets":3},{"id":"play","event":"play","piece":true,"target":3,"tickets":2},{"id":"move","event":"move","piece":true,"target":5,"tickets":2},{"id":"capture","event":"capture","piece":true,"target":3,"tickets":3},{"id":"promo","event":"promo","piece":true,"target":1,"tickets":3},{"id":"winwith","event":"winwith","piece":true,"target":2,"tickets":4},{"id":"wins","event":"win","piece":false,"target":3,"tickets":4},{"id":"promos","event":"promo","piece":false,"target":2,"tickets":2}],"questsPerDay":3,"ai":{"cendre":150,"suie":300,"bruyere":450,"orpiment":620,"vitriol":800,"cinabre":980,"antimoine":1150,"mercure":1350,"plombagine":1550,"salamandre":1750,"instructeur":2000,"athanor":2300},"pawnArmies":["soldats","mercenaires","legionnaires","barbares"],"armyBudget":24,"tuto":{"pieces":["garde-pierre","fourmi","dresseur-elephant"],"qty":6}}'::jsonb $$;
-- </catalogue>

-- -----------------------------------------------------------------
-- OUTILS INTERNES
-- -----------------------------------------------------------------

-- Fenêtre de présence : au-delà, un joueur est considéré hors ligne.
create or replace function public.ec_online_window() returns interval
language sql immutable as $$ select interval '75 seconds' $$;

-- Le jour du jeu : la date à Paris. Le coffre quotidien, la récompense
-- journalière et les quêtes basculent ensemble à minuit, heure de Paris —
-- pour tout le monde, et sans que le navigateur puisse en décider (une
-- horloge locale se règle, et un fuseau se change d'un clic).
create or replace function public.ec_today() returns text
language sql stable as $$ select to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD') $$;

-- La clé d'unicité d'un pseudo : minuscules, espaces intérieurs
-- ramenés à un seul, bords rognés. « Bob  L'Alchimiste » et
-- « bob l'alchimiste » sont donc le MÊME nom, ce qui est le seul
-- comportement honnête : deux comptes qu'on ne peut pas distinguer à
-- l'oeil ne doivent pas coexister.
create or replace function public.ec_name_key(p_name text) returns text
language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g'))
$$;

-- Le pseudo replié pour la recherche de mots interdits : sans accents, en
-- minuscules, les chiffres qui imitent des lettres remis en lettres.
create or replace function public.ec_name_fold(p_name text) returns text
language sql immutable as $$
  select translate(lower(coalesce(p_name,'')),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœ013457@',
    'aaaaaaceeeeiiiinooooouuuuyyooieasta')
$$;

-- Les mots refusés dans un pseudo : les insultes courantes, et ce qui
-- ferait passer un joueur pour l'équipe du jeu. Mêmes listes que le jeu
-- (ACC_NAME_BANNED, js/accounts.js). Les mots de trois lettres au plus ne
-- sont refusés qu'entiers.
create or replace function public.ec_name_banned(p_name text) returns boolean
language plpgsql immutable as $$
declare
  f text := ec_name_fold(p_name);
  squashed text := regexp_replace(f, '[^a-z]', '', 'g');
  words text[] := regexp_split_to_array(f, '[^a-z]+');
  w text;
begin
  foreach w in array array['admin','administrateur','moderateur','modo','staff','support','officiel',
    'epicchess','connard','connasse','salope','pute','putain','encule','enculer','nazi','hitler',
    'negre','nigger','nigga','fuck','shit','bitch','batard','bite','couille','merde','fdp','ntm','pd','tg'] loop
    if char_length(w) <= 3 then
      if w = any(words) then return true; end if;
    elsif position(w in squashed) > 0 then
      return true;
    end if;
  end loop;
  return false;
end $$;

-- Validation d'un pseudo. Renvoie null si tout va bien, sinon la phrase
-- à montrer au joueur — les mêmes règles que le client, mais c'est
-- CELLE-CI qui fait foi.
--
-- Seuls les caractères de contrôle étaient refusés : passaient les espaces
-- de largeur nulle, l'inversion du sens d'écriture, et les lettres
-- cyrilliques jumelles des latines — de quoi porter le nom d'un autre à
-- l'œil près. Un pseudo s'écrit en lettres latines (accents compris),
-- chiffres, espaces et ' - _ . , et commence par une lettre ou un chiffre.
create or replace function public.ec_name_error(p_name text) returns text
language plpgsql immutable as $$
declare n text := btrim(coalesce(p_name,''));
begin
  if char_length(n) < 2 or char_length(n) > 20 then
    return 'Le pseudo doit faire entre 2 et 20 caractères.';
  end if;
  if n ~ '\s{2,}' then return 'Un seul espace entre deux mots.'; end if;
  if n !~ '^[A-Za-z0-9À-ÖØ-öø-ÿŒœ][A-Za-z0-9À-ÖØ-öø-ÿŒœ ''._-]*$' then
    return 'Lettres, chiffres, espaces et '' - _ . seulement, en commençant par une lettre ou un chiffre.';
  end if;
  if ec_name_banned(n) then return 'Ce pseudo n''est pas autorisé.'; end if;
  return null;
end $$;

-- L'EMPREINTE DE LA CLÉ D'APPAREIL : bcrypt, salé, lent à dessein. C'était
-- un SHA-256 au préfixe fixe et sans sel. Les anciennes empreintes sont
-- encore reconnues (ec_secret_ok) et remplacées à la première connexion.
create or replace function public.ec_hash(p_secret text) returns text
language sql volatile set search_path = public, extensions as $$
  select crypt(coalesce(p_secret,''), gen_salt('bf', 8))
$$;
create or replace function public.ec_hash_legacy(p_secret text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(digest('epicchess:' || coalesce(p_secret,''), 'sha256'), 'hex')
$$;
create or replace function public.ec_secret_ok(p_hash text, p_secret text) returns boolean
language sql immutable set search_path = public, extensions as $$
  select case when left(p_hash, 2) = '$2' then p_hash = crypt(coalesce(p_secret,''), p_hash)
              else p_hash = ec_hash_legacy(p_secret) end
$$;

-- L'adresse IP de l'appel, telle que la passe la passerelle de Supabase.
-- null hors de Supabase (tests locaux) : le débit n'est alors pas compté.
create or replace function public.ec_client_ip() returns text
language plpgsql stable as $$
declare h json; v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then return null;
  end;
  v := coalesce(h->>'cf-connecting-ip', split_part(coalesce(h->>'x-forwarded-for',''), ',', 1));
  return nullif(btrim(v), '');
end $$;

-- LE DÉBIT : au plus p_max gestes `p_key` dans la fenêtre p_window. Refuse
-- au-delà, avec la phrase à montrer.
create or replace function public.ec_rate_hit(p_key text, p_window interval, p_max integer, p_msg text)
returns void language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_key is null then return; end if;
  if random() < 0.02 then delete from ec_rate where at < now() - interval '1 day'; end if;
  select count(*) into n from ec_rate where key = p_key and at > now() - p_window;
  if n >= p_max then raise exception '%', p_msg using errcode = '54000'; end if;
  insert into ec_rate(key) values (p_key);
end $$;

-- Authentification : l'identifiant du compte et son secret, tel que le
-- navigateur les garde. Pas de mot de passe à retenir — le secret est
-- tiré au sort à la création (et peut être recopié : le code de secours).
--
-- `last_seen_at` n'est réécrit que s'il a plus de vingt secondes : chaque
-- appel, lecture comprise, écrivait une ligne en base.
create or replace function public.ec_auth(p_id uuid, p_secret text)
returns public.ec_players
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  select * into p from ec_players where id = p_id;
  if not found or not ec_secret_ok(p.secret_hash, p_secret) then
    raise exception 'EC_AUTH: compte inconnu ou clé invalide' using errcode = '28000';
  end if;
  if left(p.secret_hash, 2) <> '$2' then
    update ec_players set secret_hash = ec_hash(p_secret) where id = p_id;
  end if;
  if p.last_seen_at < now() - interval '20 seconds' then
    update ec_players set last_seen_at = now() where id = p_id;
    p.last_seen_at := now();
  end if;
  return p;
end $$;

-- -----------------------------------------------------------------
-- LE CLAN D'UN JOUEUR, EN UNE LIGNE
-- -----------------------------------------------------------------
-- Ce que la fiche du joueur, son profil public et le classement montrent
-- de son clan. null s'il n'en a pas.
-- En plpgsql et non en sql : le corps d'une fonction sql est vérifié à sa
-- création, et supabase/schema.sql la déclare AVANT ec_self, qui l'appelle
-- — un corps vérifié à ce moment-là chercherait des fonctions pas encore
-- écrites.
create or replace function public.ec_clan_brief(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return (select jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag,
                   'blazon', c.blazon, 'level', ec_clan_level(c.points_total), 'role', m.role)
            from ec_clan_members m join ec_clans c on c.id = m.clan_id
           where m.player_id = p_player);
end $$;

-- La fiche COMPLÈTE, pour le propriétaire du compte.
create or replace function public.ec_self(p public.ec_players) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'is_admin', p.is_admin,
    'elo', p.elo, 'elo_peak', p.elo_peak,
    'ranked_games', p.ranked_games, 'ranked_wins', p.ranked_wins,
    'ranked_draws', p.ranked_draws,
    'best_streak', p.best_streak, 'cur_streak', p.cur_streak,
    'piece_stats', p.piece_stats, 'history', p.history, 'state', p.state,
    'clan', ec_clan_brief(p.id),
    'created_at', p.created_at, 'last_seen_at', p.last_seen_at)
$$;

-- La fiche PUBLIQUE : ce que le classement, la recherche et le profil
-- d'un autre joueur ont le droit de montrer. Jamais le secret, jamais
-- `state` EN ENTIER, mais l'historique récent et les statistiques :
-- c'est ce qu'on vient voir.
--
-- DEUX CHOSES SORTENT MAINTENANT DE `state`, ET DEUX SEULEMENT.
-- Un profil ne disait rien de ce que le joueur ALIGNE. On y lisait son
-- ELO, sa forme et sa créature fétiche, puis on cliquait « Défier » sans
-- avoir la moindre idée de ce qu'on allait avoir en face — alors que
-- l'armée est justement ce qui distingue deux joueurs de même niveau.
--
--   pub_army      l'armée choisie : cinq identifiants de pièces. C'est ce
--                 que l'adversaire va aligner, et il l'aligne DÉJÀ sous
--                 les yeux de tout le monde à chaque partie.
--   pub_unlocked  les pièces débloquées : le catalogue dont il dispose.
--   pub_powers    les pouvoirs ÉVEILLÉS. Une créature ne vient plus avec
--                 son pouvoir : il s'éveille à part, avec des débris
--                 magiques. Ils ne se déduisent donc plus des pièces.
--
-- CE QUI NE SORT PAS : l'inventaire (le nombre d'exemplaires de chaque
-- créature), les perles, les tickets, les jokers, la progression des
-- voies, les armées de l'IA, l'état du tutoriel. Rien de ce qui touche à
-- la RESSOURCE d'un joueur — savoir qu'il n'a plus qu'un exemplaire de sa
-- pièce maîtresse serait un renseignement, pas une présentation.
--
-- `->` et non `->>` : on renvoie les valeurs JSON telles quelles
-- (tableau d'armées, tableau d'identifiants), et `coalesce` garantit un
-- tableau vide plutôt qu'un `null` aux comptes qui n'ont rien enregistré.
create or replace function public.ec_public(p public.ec_players) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username,
    'elo', p.elo, 'elo_peak', p.elo_peak,
    'ranked_games', p.ranked_games, 'ranked_wins', p.ranked_wins,
    'ranked_draws', p.ranked_draws, 'best_streak', p.best_streak,
    'piece_stats', p.piece_stats,
    'history', (select coalesce(jsonb_agg(e), '[]'::jsonb)
                from (select e from jsonb_array_elements(p.history) e
                      offset greatest(0, jsonb_array_length(p.history) - 10)) s),
    'pub_army', coalesce(p.state->'armies', '[]'::jsonb),
    'pub_unlocked', coalesce(p.state->'unlocked_pieces', '[]'::jsonb),
    'pub_powers', coalesce(p.state->'unlocked_powers', '[]'::jsonb),
    'clan', ec_clan_brief(p.id),
    'created_at', p.created_at, 'last_seen_at', p.last_seen_at,
    'online', p.last_seen_at > now() - ec_online_window())
$$;

-- -----------------------------------------------------------------
-- CRÉATION, CONNEXION, IDENTITÉ
-- -----------------------------------------------------------------

-- Le pseudo est-il libre ? Sert au champ de saisie, qui prévient AVANT
-- d'envoyer. L'unicité reste garantie par la contrainte, pas par cette
-- réponse : entre la question et la création, quelqu'un peut avoir pris
-- le nom.
create or replace function public.ec_name_free(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := ec_name_error(p_name);
begin
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if exists(select 1 from ec_players where username_key = ec_name_key(p_name)) then
    return jsonb_build_object('ok', false, 'error', 'Ce pseudo est déjà pris.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ec_signup(p_username text, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := ec_name_error(p_username); p public.ec_players;
begin
  if e is not null then raise exception '%', e using errcode = '22023'; end if;
  if coalesce(p_secret,'') = '' or char_length(p_secret) < 16 or char_length(p_secret) > 128 then
    raise exception 'EC_SECRET: clé d''appareil manquante' using errcode = '22023';
  end if;
  -- LES COMPTES NE SE CRÉENT PLUS À LA CHAÎNE : vingt par heure et par
  -- adresse au plus (une salle de classe derrière une même box y tient).
  perform ec_rate_hit('signup:' || ec_client_ip(), interval '1 hour', 20,
    'Trop de comptes créés depuis cette connexion. Réessayez dans une heure.');
  begin
    insert into ec_players(username, username_key, secret_hash, state)
    values (btrim(p_username), ec_name_key(p_username), ec_hash(p_secret), ec_eco_init('{}'::jsonb, 0))
    returning * into p;
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris.' using errcode = '23505';
  end;
  return ec_self(p);
end $$;

create or replace function public.ec_login(p_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  p := ec_auth(p_id, p_secret);
  -- Ce qui était resté ouvert au départ précédent est un abandon.
  perform ec_match_sweep(p.id, true);
  select * into p from ec_players where id = p.id for update;
  update ec_players set state = ec_eco_init(p.state, p.elo_peak) where id = p.id returning * into p;
  return ec_self(p);
end $$;

-- CHANGER LA CLÉ D'APPAREIL (le code de secours) : l'ancienne cesse de
-- fonctionner, partout.
create or replace function public.ec_rotate_secret(p_id uuid, p_secret text, p_new_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  p := ec_auth(p_id, p_secret);
  if coalesce(p_new_secret,'') = '' or char_length(p_new_secret) < 16 or char_length(p_new_secret) > 128 then
    raise exception 'EC_SECRET: clé d''appareil invalide' using errcode = '22023';
  end if;
  update ec_players set secret_hash = ec_hash(p_new_secret) where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

-- Battement de présence : c'est lui qui allume la pastille « en ligne »
-- pour les autres joueurs. Renvoie le nombre de joueurs actuellement
-- connectés, de quoi l'afficher sans un second aller-retour.
create or replace function public.ec_touch(p_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; q public.ec_players; n integer; st jsonb;
begin
  p := ec_auth(p_id, p_secret);
  -- Le battement règle aussi ce qui attendait : la partie gagnée dont
  -- l'adversaire a disparu, et le passage au jour suivant (quêtes).
  perform ec_match_sweep(p.id, false);
  select * into q from ec_players where id = p.id for update;
  st := ec_eco_init(q.state, q.elo_peak);
  if st is distinct from q.state then
    update ec_players set state = st where id = q.id returning * into q;
  end if;
  select count(*) into n from ec_players
   where last_seen_at > now() - ec_online_window() and not is_admin;
  return jsonb_build_object('ok', true, 'online', n)
    || case when q.state is distinct from p.state or q.elo <> p.elo or q.history is distinct from p.history
            then jsonb_build_object('profile', ec_self(q)) else '{}'::jsonb end;
end $$;

create or replace function public.ec_rename(p_id uuid, p_secret text, p_username text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; e text := ec_name_error(p_username);
begin
  p := ec_auth(p_id, p_secret);
  if e is not null then raise exception '%', e using errcode = '22023'; end if;
  -- Se renommer « Bob » quand on s'appelle « bob » doit marcher : c'est
  -- le même compte, la contrainte d'unicité ne le voit même pas.
  begin
    update ec_players
       set username = btrim(p_username), username_key = ec_name_key(p_username)
     where id = p.id returning * into p;
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris.' using errcode = '23505';
  end;
  return ec_self(p);
end $$;

-- Suppression définitive d'un compte, par son propriétaire.
create or replace function public.ec_delete(p_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  p := ec_auth(p_id, p_secret);
  perform ec_clan_remove(p.id, 'leave', null);
  delete from ec_players where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

-- -----------------------------------------------------------------
-- LA PROGRESSION QUE LE CLIENT PILOTE
-- -----------------------------------------------------------------
-- Armées, réglages, tutoriel, amis… Le serveur les conserve et les sert.
-- Il refuse tout ce qui touche au classement ET à l'économie : ces clés
-- ne s'écrivent que par les fonctions de ce fichier. Et il borne la taille :
-- un `state` sans limite était une façon de remplir la base.
create or replace function public.ec_save_state(p_id uuid, p_secret text, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; clean jsonb; k text;
begin
  p := ec_auth(p_id, p_secret);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', true);
  end if;
  clean := p_patch
    - 'elo' - 'elo_peak' - 'ranked_games' - 'ranked_wins' - 'best_streak'
    - 'piece_stats' - 'match_history' - 'rank_max';
  foreach k in array ec_eco_keys() loop clean := clean - k; end loop;
  if octet_length((p.state || clean)::text) > 65536 then
    raise exception 'EC_STATE: progression trop volumineuse.' using errcode = '54000';
  end if;
  update ec_players set state = state || clean where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

-- -----------------------------------------------------------------
-- LE CLASSEMENT EST CALCULÉ ICI, ET NULLE PART AILLEURS
-- -----------------------------------------------------------------
-- Transcription exacte de vvCalcNewElo (js/voie.js). Si vous touchez à
-- l'un des deux, touchez à l'autre : le client ne sert qu'à AFFICHER un
-- écart pendant la cinématique de fin de partie, la valeur qui compte
-- est celle que renvoie cette fonction.
--
-- Rappel du réglage : K dégressif (30 en placement, puis 22/18/14, et
-- une pente jusqu'à 10 entre 1700 et 2000), courbe d'ascension qui
-- majore les gains (×1,9 à 0 ELO) et amortit les pertes (×0,30) en
-- s'éteignant à 2000, amplitude bornée à ±30, plancher à zéro.
create or replace function public.ec_elo_k(p_elo numeric, p_games integer)
returns numeric language sql immutable as $$
  select case
    when p_elo >= 2000 then 10
    when p_games < 5   then 30
    when p_games < 20  then 22
    when p_games < 60  then 18
    when p_elo > 1700  then 14 + (10 - 14) * ((p_elo - 1700) / 300.0)
    else 14 end
$$;

-- Math.round() de JavaScript arrondit VERS +∞ à la demie (-2,5 → -2),
-- là où round() de Postgres s'éloigne de zéro (-2,5 → -3). Sans ce
-- floor(x+0,5), le serveur et le client afficheraient parfois un point
-- d'écart — le genre de désaccord qui fait croire à une triche.
create or replace function public.ec_jsround(x numeric) returns integer
language sql immutable as $$ select floor(x + 0.5)::integer $$;

create or replace function public.ec_elo_calc(
  p_elo integer, p_opp integer, p_result text, p_games integer)
returns jsonb language plpgsql immutable as $$
declare
  k numeric := ec_elo_k(p_elo, p_games);
  e numeric := 1 / (1 + power(10, (p_opp - p_elo) / 400.0));
  s numeric := case p_result when 'win' then 1 when 'loss' then 0 else 0.5 end;
  raw numeric := k * (s - e);
  lin numeric := greatest(0, least(1, (2000 - p_elo) / 2000.0));
  gain numeric := 1 + 0.9 * lin;
  loss numeric := 1 - 0.7 * lin;
  d integer;
  new_elo integer;
begin
  -- Une victoire peut ne rien rapporter (contre bien plus faible que soi) :
  -- le plancher de +1 permettait de monter indéfiniment en battant le plus
  -- faible. Une défaite coûte toujours au moins 1.
  if p_result = 'win' then
    d := greatest(0, ec_jsround(raw * gain));
  elsif p_result = 'loss' then
    d := least(-1, ec_jsround(raw * loss));
  else
    d := ec_jsround(raw * (case when raw >= 0 then gain else loss end));
  end if;
  d := greatest(-30, least(30, d));
  new_elo := greatest(0, p_elo + d);
  return jsonb_build_object('new_elo', new_elo, 'delta', new_elo - p_elo,
                            'k', k, 'games', p_games);
end $$;

-- =================================================================
-- L'ÉCONOMIE, TENUE PAR LE SERVEUR
-- =================================================================
-- Elle vivait dans le navigateur : perles, coffres tirés par Math.random,
-- inventaire, débris, jokers, tickets, quêtes, colonne des victoires —
-- tout s'écrivait par ec_save_state, et une ligne de console suffisait à
-- se donner mille perles ou le catalogue entier. Tout ce qui suit en est la
-- transcription fidèle (js/economy.js, js/rewards.js, js/voie.js), avec la
-- différence qui compte : le tirage et l'écriture se font ICI, et
-- ec_save_state refuse désormais ces clés (ec_eco_keys).
--
-- Les fonctions ec_eco_* prennent et rendent un `state` (jsonb) : elles
-- ne touchent pas à la table. Les portes exposées (ec_eco, ec_match_*)
-- verrouillent la ligne du joueur, appliquent, puis écrivent.

-- Les clés de `state` qui appartiennent au serveur.
create or replace function public.ec_eco_keys() returns text[]
language sql immutable as $$ select array[
  'inventory','pearls','debris','unlocked_pieces','unlocked_powers','powers_v1','chest_dry',
  'engaged_now','win_streak','daily_last','col_laurels','col_wins','col_claimed','jokers',
  'tickets','rich_claimed','quests_day','quests','dr_idx','dr_day','voie_rewards_claimed',
  'voie_chests','tuto_rewards'] $$;

-- -- PETITS OUTILS ------------------------------------------------
create or replace function public.ec_rand_int(a integer, b integer) returns integer
language sql volatile as $$ select a + floor(random() * (b - a + 1))::integer $$;

-- Un entier positif lu dans `state` (0 s'il manque ou n'en est pas un).
create or replace function public.ec_si(st jsonb, k text) returns integer
language sql immutable as $$
  select case when jsonb_typeof(st->k) = 'number' then greatest(0, floor((st->>k)::numeric))::integer else 0 end
$$;
create or replace function public.ec_sobj(st jsonb, k text) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(st->k) = 'object' then st->k else '{}'::jsonb end
$$;
create or replace function public.ec_sarr(st jsonb, k text) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(st->k) = 'array' then st->k else '[]'::jsonb end
$$;
create or replace function public.ec_text_arr(j jsonb) returns text[]
language sql immutable as $$
  select coalesce(array(select x from jsonb_array_elements_text(
    case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) x), array[]::text[])
$$;

-- Le catalogue : une pièce, et ses propriétés.
create or replace function public.ec_piece(p_id text) returns jsonb
language sql immutable as $$ select ec_cat()->'pieces'->p_id $$;
-- « Possédable » : une créature du catalogue. Les pions et pièces standard
-- (std-*) ne se possèdent pas, ils sont fournis à chaque partie.
create or replace function public.ec_ownable(p_id text) returns boolean
language sql immutable as $$ select p_id is not null and ec_cat()->'pieces' ? p_id $$;
create or replace function public.ec_has_power(p_id text) returns boolean
language sql immutable as $$ select coalesce((ec_piece(p_id)->>'power')::boolean, false) $$;
create or replace function public.ec_deploy(p_id text) returns integer
language sql immutable as $$ select case when coalesce((ec_piece(p_id)->>'qty')::integer, 1) >= 2 then 2 else 1 end $$;
-- L'arène d'un joueur : le rang de son SOMMET atteint.
create or replace function public.ec_arena(p_peak integer) returns integer
language sql immutable as $$
  select greatest(0, (select count(*)::integer from jsonb_array_elements(ec_cat()->'ranks') r
                       where (r->>'min')::integer <= coalesce(p_peak,0)) - 1)
$$;

-- -- L'INVENTAIRE -------------------------------------------------
create or replace function public.ec_inv(st jsonb, p_id text) returns integer
language sql immutable as $$
  select case when jsonb_typeof(ec_sobj(st,'inventory')->p_id) = 'number'
              then greatest(0, (ec_sobj(st,'inventory')->>p_id)::numeric)::integer else 0 end
$$;
create or replace function public.ec_inv_add(st jsonb, p_id text, n integer) returns jsonb
language plpgsql immutable as $$
begin
  if not ec_ownable(p_id) or coalesce(n,0) = 0 then return st; end if;
  return jsonb_set(st, '{inventory}', ec_sobj(st,'inventory')
    || jsonb_build_object(p_id, greatest(0, ec_inv(st, p_id) + n)));
end $$;
create or replace function public.ec_inv_add_map(st jsonb, m jsonb) returns jsonb
language plpgsql immutable as $$
declare k text; v jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(m,'{}'::jsonb)) loop
    if jsonb_typeof(v) = 'number' then st := ec_inv_add(st, k, (v::text)::integer); end if;
  end loop;
  return st;
end $$;
-- « Possédée » = débloquée, ou présente en stock.
create or replace function public.ec_owned(st jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct id order by id), array[]::text[]) from (
    select x as id from jsonb_array_elements_text(ec_sarr(st,'unlocked_pieces')) x
    union select k from jsonb_each(ec_sobj(st,'inventory')) e(k,v)
     where jsonb_typeof(v) = 'number' and (v::text)::numeric > 0
  ) s where ec_ownable(id)
$$;
create or replace function public.ec_unlocked(st jsonb) returns text[]
language sql immutable as $$ select ec_text_arr(ec_sarr(st,'unlocked_pieces')) $$;
create or replace function public.ec_powers(st jsonb) returns text[]
language sql immutable as $$ select ec_text_arr(ec_sarr(st,'unlocked_powers')) $$;
create or replace function public.ec_add_to_list(st jsonb, k text, v text) returns jsonb
language sql immutable as $$
  select case when ec_sarr(st,k) ? v then st else jsonb_set(st, array[k], ec_sarr(st,k) || to_jsonb(v)) end
$$;
create or replace function public.ec_set_int(st jsonb, k text, n integer) returns jsonb
language sql immutable as $$ select jsonb_set(st, array[k], to_jsonb(greatest(0, coalesce(n,0)))) $$;

-- -- LE TIRAGE ----------------------------------------------------
-- Poids de tirage : l'inverse de la valeur de la pièce, tempéré par le
-- biais du coffre (pieceRarityWeight, js/economy.js).
create or replace function public.ec_pick_weighted(ids text[], bias numeric) returns text
language plpgsql volatile as $$
declare w numeric[] := array[]::numeric[]; total numeric := 0; r numeric; i integer; v numeric;
begin
  if ids is null or array_length(ids,1) is null then return null; end if;
  for i in 1..array_length(ids,1) loop
    v := greatest(1, coalesce((ec_piece(ids[i])->>'value')::numeric, 3));
    w := w || power(1/v, 1.7/greatest(0.2, bias));
    total := total + w[i];
  end loop;
  r := random() * total;
  for i in 1..array_length(ids,1) loop
    r := r - w[i];
    if r <= 0 then return ids[i]; end if;
  end loop;
  return ids[array_length(ids,1)];
end $$;

-- Découpe `total` en `n` parts entières d'au moins 1 (chestSplit).
create or replace function public.ec_split(total integer, n integer) returns integer[]
language plpgsql volatile as $$
declare cuts integer[]; parts integer[] := array[]::integer[]; prev integer := 0; c integer;
begin
  n := greatest(1, least(n, total));
  if n = 1 then return array[total]; end if;
  select array_agg(x order by x) into cuts from
    (select x from generate_series(1, total - 1) x order by random() limit n - 1) s;
  foreach c in array cuts loop parts := parts || (c - prev); prev := c; end loop;
  return parts || (total - prev);
end $$;

-- Applique une liste de lots au state (chestApply).
create or replace function public.ec_apply_lots(st jsonb, lots jsonb) returns jsonb
language plpgsql immutable as $$
declare l jsonb; id text; n integer;
begin
  for l in select * from jsonb_array_elements(coalesce(lots,'[]'::jsonb)) loop
    if l ? 'pearls' then
      st := ec_set_int(st, 'pearls', ec_si(st,'pearls') + (l->>'pearls')::integer);
    elsif l ? 'debris' then
      id := l->>'debris'; n := (l->>'qty')::integer;
      if ec_has_power(id) and not (id = any(ec_powers(st))) then
        st := jsonb_set(st, '{debris}', ec_sobj(st,'debris')
          || jsonb_build_object(id, coalesce((ec_sobj(st,'debris')->>id)::integer,0) + n));
      end if;
    elsif l ? 'pieceId' then
      id := l->>'pieceId';
      st := ec_inv_add(st, id, (l->>'qty')::integer);
      if coalesce((l->>'withPower')::boolean,false) and ec_has_power(id) then
        st := ec_add_to_list(st, 'unlocked_powers', id);
      end if;
      if coalesce((l->>'isNew')::boolean,false) and not (id = any(ec_unlocked(st))) then
        st := ec_add_to_list(st, 'unlocked_pieces', id);
        st := ec_set_int(st, 'chest_dry', 0);
      end if;
    end if;
  end loop;
  return st;
end $$;

-- OUVRE UN COFFRE : tire son contenu ET l'applique. Rend {state, lots}.
-- Transcription de chestRoll (js/economy.js) : perles, puis soit la
-- créature inédite (qui prend tout le coffre), soit des débris pour une
-- créature dont le pouvoir dort, et des exemplaires des pièces possédées
-- répartis en lots.
create or replace function public.ec_chest_open(st jsonb, p_peak integer, p_chest text) returns jsonb
language plpgsql volatile as $$
declare
  c jsonb := ec_cat()->'chests'->p_chest;
  owned text[] := ec_owned(st);
  locked text[];
  dry integer := ec_si(st,'chest_dry');
  pity boolean;
  lucky numeric;
  lots jsonb := '[]'::jsonb;
  total integer;
  pick text;
  sleepers text[];
  w numeric[]; tw numeric; r numeric; i integer;
  part integer; good boolean; merged jsonb := '[]'::jsonb; l jsonb; found_i integer;
begin
  if c is null then raise exception 'Coffre inconnu.' using errcode = '22023'; end if;
  select coalesce(array_agg(k order by k), array[]::text[]) into locked
    from jsonb_object_keys(ec_cat()->'pieces') k
   where not (k = any(ec_unlocked(st))) and (ec_piece(k)->>'arena')::integer <= ec_arena(p_peak);
  pity := dry >= (ec_cat()->>'chestPity')::integer;
  lucky := greatest(0.1, least(0.75, 0.22 + (c->>'tier')::numeric*0.09 - (c->>'newChance')::numeric*0.5));
  lots := lots || jsonb_build_array(jsonb_build_object('pearls',
            ec_rand_int((c->'pearls'->>0)::integer, (c->'pearls'->>1)::integer)));
  total := greatest(1, ec_rand_int((c->'total'->>0)::integer, (c->'total'->>1)::integer));

  if array_length(locked,1) is not null and
     (array_length(owned,1) is null or pity or random() < (c->>'newChance')::numeric) then
    pick := ec_pick_weighted(locked, (c->>'bias')::numeric);
    lots := lots || jsonb_build_array(jsonb_build_object('pieceId', pick, 'qty', greatest(2,total), 'isNew', true));
    return jsonb_build_object('state', ec_apply_lots(st, lots), 'lots', lots);
  end if;
  if array_length(locked,1) is not null then st := ec_set_int(st, 'chest_dry', dry + 1); end if;

  -- Les débris magiques : une seule créature possédée dont le pouvoir dort,
  -- la plus proche de son éveil favorisée.
  select coalesce(array_agg(x order by x), array[]::text[]) into sleepers
    from unnest(owned) x where ec_has_power(x) and not (x = any(ec_powers(st)));
  if c->'debris' is not null and array_length(sleepers,1) is not null
     and random() < (c->'debris'->>'p')::numeric then
    w := array[]::numeric[]; tw := 0;
    for i in 1..array_length(sleepers,1) loop
      w := w || (1 + 2*least(1, coalesce((ec_sobj(st,'debris')->>sleepers[i])::numeric,0)
                              / (ec_cat()->>'debrisNeeded')::numeric));
      tw := tw + w[i];
    end loop;
    r := random()*tw; pick := sleepers[array_length(sleepers,1)];
    for i in 1..array_length(sleepers,1) loop
      r := r - w[i]; if r <= 0 then pick := sleepers[i]; exit; end if;
    end loop;
    lots := lots || jsonb_build_array(jsonb_build_object('debris', pick, 'qty',
      ec_rand_int((c->'debris'->'n'->>0)::integer, (c->'debris'->'n'->>1)::integer)));
  end if;

  if array_length(owned,1) is not null then
    foreach part in array ec_split(total, greatest(1, (c->>'rolls')::integer + ec_rand_int(-1,1))) loop
      good := random() < lucky;
      pick := ec_pick_weighted(owned, (c->>'bias')::numeric * (case when good then 2.2 else 1 end));
      lots := lots || jsonb_build_array(jsonb_build_object('pieceId', pick, 'qty', part, 'isNew', false, 'lucky', good));
    end loop;
  end if;
  -- Fusion des doublons : deux lots de Méduse s'affichent en un seul.
  for l in select * from jsonb_array_elements(lots) loop
    if not (l ? 'pieceId') then merged := merged || jsonb_build_array(l); continue; end if;
    found_i := null;
    for i in 0..jsonb_array_length(merged)-1 loop
      if merged->i->>'pieceId' = l->>'pieceId' then found_i := i; exit; end if;
    end loop;
    if found_i is null then merged := merged || jsonb_build_array(l);
    else
      merged := jsonb_set(merged, array[found_i::text], merged->found_i || jsonb_build_object(
        'qty', (merged->found_i->>'qty')::integer + (l->>'qty')::integer,
        'lucky', (merged->found_i->>'lucky')::boolean or (l->>'lucky')::boolean));
    end if;
  end loop;
  return jsonb_build_object('state', ec_apply_lots(st, merged), 'lots', merged);
end $$;

-- -- LES QUÊTES DU JOUR -------------------------------------------
-- Trois quêtes tirées dans QUEST_POOL, chacune sur une créature possédée
-- (hors Monarque) quand elle en demande une (questRoll, js/rewards.js).
create or replace function public.ec_quests_roll(st jsonb) returns jsonb
language plpgsql volatile as $$
declare pieces text[]; tpls jsonb; out jsonb := '[]'::jsonb; t jsonb; pi integer := 0; pid text;
begin
  select coalesce(array_agg(x order by random()), array[]::text[]) into pieces
    from unnest(ec_owned(st)) x where ec_piece(x)->>'cls' <> 'Monarque';
  select coalesce(jsonb_agg(q order by random()), '[]'::jsonb) into tpls
    from jsonb_array_elements(ec_cat()->'quests') q
   where not (q->>'piece')::boolean or array_length(pieces,1) is not null;
  for t in select * from jsonb_array_elements(tpls) limit (ec_cat()->>'questsPerDay')::integer loop
    pid := null;
    if (t->>'piece')::boolean then
      if pi >= array_length(pieces,1) then pi := 0; end if;
      pi := pi + 1; pid := pieces[pi];
    end if;
    out := out || jsonb_build_array(jsonb_build_object('id', t->>'id', 'pieceId', pid, 'prog', 0, 'done', false));
  end loop;
  return out;
end $$;

-- Fait avancer les quêtes du jour. `ev` : {event: {pieceId|'*': n}}.
-- Rend {state, earned}.
create or replace function public.ec_quests_note(st jsonb, ev jsonb) returns jsonb
language plpgsql immutable as $$
declare qs jsonb := ec_sarr(st,'quests'); q jsonb; tpl jsonb; i integer; n integer; earned integer := 0;
  prog integer; target integer;
begin
  if jsonb_array_length(qs) = 0 then return jsonb_build_object('state', st, 'earned', 0); end if;
  for i in 0..jsonb_array_length(qs)-1 loop
    q := qs->i;
    if coalesce((q->>'done')::boolean,false) then continue; end if;
    select x into tpl from jsonb_array_elements(ec_cat()->'quests') x where x->>'id' = q->>'id';
    if tpl is null then continue; end if;
    if (tpl->>'piece')::boolean then n := coalesce((ev->(tpl->>'event')->>(q->>'pieceId'))::integer, 0);
    else n := coalesce((select sum(v::text::integer) from jsonb_each(coalesce(ev->(tpl->>'event'),'{}'::jsonb)) e(k,v)),0);
    end if;
    if n <= 0 then continue; end if;
    target := (tpl->>'target')::integer;
    -- « Jouer 3 fois dans une même bataille » se compte par bataille.
    if tpl->>'event' = 'play' then prog := greatest(coalesce((q->>'prog')::integer,0), least(target, n));
    else prog := least(target, coalesce((q->>'prog')::integer,0) + n); end if;
    q := q || jsonb_build_object('prog', prog);
    if prog >= target then q := q || '{"done":true}'::jsonb; earned := earned + (tpl->>'tickets')::integer; end if;
    qs := jsonb_set(qs, array[i::text], q);
  end loop;
  st := jsonb_set(st, '{quests}', qs);
  if earned > 0 then st := ec_set_int(st, 'tickets', ec_si(st,'tickets') + earned); end if;
  return jsonb_build_object('state', st, 'earned', earned);
end $$;

-- -- L'ENTRETIEN D'UN COMPTE --------------------------------------
-- À chaque connexion : dotation de départ, pièces retirées, migration des
-- pouvoirs (accMigratePowers), quêtes du jour. Idempotent.
create or replace function public.ec_eco_init(st jsonb, p_peak integer) returns jsonb
language plpgsql volatile as $$
declare k text; v jsonb; inv jsonb; ul jsonb; legacy text; lim integer;
begin
  st := coalesce(st,'{}'::jsonb);
  -- Les pièces retirées sortent de l'inventaire et des déblocages.
  inv := '{}'::jsonb;
  for k, v in select * from jsonb_each(ec_sobj(st,'inventory')) loop
    if ec_ownable(k) and jsonb_typeof(v) = 'number' then inv := inv || jsonb_build_object(k, greatest(0,(v::text)::numeric)::integer); end if;
  end loop;
  st := jsonb_set(st, '{inventory}', inv);
  if jsonb_typeof(st->'unlocked_pieces') = 'array' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into ul from jsonb_array_elements_text(st->'unlocked_pieces') x where ec_ownable(x);
  else
    ul := ec_cat()->'starterPieces';
  end if;
  st := jsonb_set(st, '{unlocked_pieces}', ul);
  -- LA MIGRATION DES POUVOIRS (une fois par compte) : ce que l'ancienne
  -- Diagonale donnait au sommet atteint, et le pouvoir de tout ce qui est
  -- déjà possédé.
  if not coalesce((st->>'powers_v1')::boolean, false) then
    for legacy, lim in select key, value::text::integer from jsonb_each(ec_cat()->'legacyUnlocks') loop
      if lim <= coalesce(p_peak,0) then st := ec_add_to_list(st, 'unlocked_pieces', legacy); end if;
    end loop;
    foreach k in array ec_owned(st) loop
      if ec_has_power(k) then st := ec_add_to_list(st, 'unlocked_powers', k); end if;
    end loop;
    st := st || '{"powers_v1":true}'::jsonb;
  end if;
  -- Dotation de départ des pièces débloquées sans stock (invEnsureStarter).
  foreach k in array ec_unlocked(st) loop
    if not (ec_sobj(st,'inventory') ? k) then
      st := jsonb_set(st, '{inventory}', ec_sobj(st,'inventory') || jsonb_build_object(k, (ec_cat()->>'starterStock')::integer));
    end if;
  end loop;
  -- Les quêtes du jour.
  if coalesce(st->>'quests_day','') <> ec_today() or jsonb_typeof(st->'quests') <> 'array' then
    st := st || jsonb_build_object('quests_day', ec_today(), 'quests', ec_quests_roll(st));
  end if;
  -- L'ancien compteur de la colonne (des victoires, avant les lauriers).
  if not (st ? 'col_laurels') and ec_si(st,'col_wins') > 0 then
    st := ec_set_int(st, 'col_laurels', least(ec_si(st,'col_wins') * (ec_cat()->>'laurelsPerStep')::integer,
      jsonb_array_length(ec_cat()->'column') * (ec_cat()->>'laurelsPerStep')::integer));
  end if;
  return st;
end $$;

-- Les jalons de la Diagonale franchis par le sommet (vvCheckRewardMilestones).
create or replace function public.ec_milestones(st jsonb, p_old integer, p_new integer) returns jsonb
language plpgsql immutable as $$
declare m jsonb; got jsonb := '[]'::jsonb;
begin
  if p_new <= p_old then return jsonb_build_object('state', st, 'granted', got); end if;
  for m in select * from jsonb_array_elements(ec_cat()->'milestones') loop
    if ec_sarr(st,'voie_rewards_claimed') ? (m->>'id') then continue; end if;
    if not ((m->>'elo')::integer > p_old and (m->>'elo')::integer <= p_new) then continue; end if;
    if m->>'reward' = 'pearls' then st := ec_set_int(st, 'pearls', ec_si(st,'pearls') + (m->>'amount')::integer);
    elsif m->>'reward' = 'chest' then st := jsonb_set(st, '{voie_chests}', ec_sarr(st,'voie_chests') || to_jsonb(m->>'id'));
    elsif m->>'reward' = 'copies' then st := ec_inv_add(st, m->>'copyId', (m->>'qty')::integer);
    end if;
    st := ec_add_to_list(st, 'voie_rewards_claimed', m->>'id');
    got := got || jsonb_build_array(m);
  end loop;
  return jsonb_build_object('state', st, 'granted', got);
end $$;

-- Les lauriers d'une victoire, selon sa longueur (laurelsForMoves).
create or replace function public.ec_laurels_for(p_moves integer) returns integer
language sql immutable as $$
  select coalesce((select (t->>'laurels')::integer from jsonb_array_elements(ec_cat()->'laurelScale') t
                    where coalesce(p_moves, 1000000) <= (t->>'upTo')::integer
                    order by (t->>'upTo')::integer limit 1),
                  (ec_cat()->>'laurelsFloor')::integer)
$$;

-- -- LES GESTES DE L'ÉCONOMIE -------------------------------------
-- Une seule porte, `ec_eco(action, arg)`, pour tout ce que le joueur
-- déclenche hors d'une partie. Chaque action vérifie son droit, tire au
-- sort s'il le faut, écrit, et rend {state, …ce qu'il faut montrer}.
create or replace function public.ec_eco(p_id uuid, p_secret text, p_action text, p_arg jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.ec_players;
  st jsonb;
  r jsonb := '{}'::jsonb;
  o jsonb;
  step jsonb;
  idx integer; n integer; price integer; k text;
  arg jsonb := coalesce(p_arg, '{}'::jsonb);
  gains jsonb := '{}'::jsonb;
begin
  p := ec_auth(p_id, p_secret);
  select * into p from ec_players where id = p.id for update;
  if p.is_admin and p_action <> 'sync' then
    raise exception 'Le mode test ne touche pas à la progression.' using errcode = '22023';
  end if;
  st := ec_eco_init(p.state, p.elo_peak);

  if p_action = 'sync' then
    null;

  -- Le Magasin : on paie, le coffre s'ouvre.
  elsif p_action = 'shop' then
    k := arg->>'chest';
    if ec_cat()->'chests'->k is null then raise exception 'Coffre inconnu.' using errcode = '22023'; end if;
    price := (ec_cat()->'chests'->k->>'price')::integer;
    if ec_si(st,'pearls') < price then
      raise exception 'Il vous manque % perles pour ce coffre.', price - ec_si(st,'pearls') using errcode = '22023';
    end if;
    st := ec_set_int(st, 'pearls', ec_si(st,'pearls') - price);
    o := ec_chest_open(st, p.elo_peak, k); st := o->'state';
    r := jsonb_build_object('chest', k, 'lots', o->'lots');

  -- La récompense journalière : le lot suivant du cycle, un par jour.
  elsif p_action = 'daily' then
    if st->>'dr_day' = ec_today() then raise exception 'La récompense du jour a déjà été prise.' using errcode = '22023'; end if;
    n := jsonb_array_length(ec_cat()->'daily');
    idx := ec_si(st,'dr_idx') % n;
    step := ec_cat()->'daily'->idx;
    st := st || jsonb_build_object('dr_day', ec_today(), 'dr_idx', ec_si(st,'dr_idx') + 1);
    r := jsonb_build_object('step', step || jsonb_build_object('idx', idx));
    if step ? 'chest' then o := ec_chest_open(st, p.elo_peak, step->>'chest'); st := o->'state'; r := r || jsonb_build_object('chest', step->>'chest', 'lots', o->'lots');
    elsif step ? 'pearls' then st := ec_set_int(st, 'pearls', ec_si(st,'pearls') + (step->>'pearls')::integer);
    elsif step ? 'jokers' then st := ec_set_int(st, 'jokers', ec_si(st,'jokers') + (step->>'jokers')::integer);
    end if;

  -- Le coffre de réapprovisionnement : remet à flot ce qui est bas.
  elsif p_action = 'restock' then
    if st->>'daily_last' = ec_today() then raise exception 'Le réapprovisionnement du jour est déjà fait.' using errcode = '22023'; end if;
    foreach k in array ec_owned(st) loop
      n := least((ec_cat()->'restock'->>'perPiece')::integer, (ec_cat()->'restock'->>'cap')::integer - ec_inv(st,k));
      if n > 0 then gains := gains || jsonb_build_object(k, n); end if;
    end loop;
    st := ec_inv_add_map(st, gains) || jsonb_build_object('daily_last', ec_today());
    r := jsonb_build_object('gains', gains);

  -- La colonne des victoires : le palier suivant, s'il est gagné.
  elsif p_action = 'column' then
    idx := ec_si(st,'col_claimed');
    n := least(jsonb_array_length(ec_cat()->'column'), ec_si(st,'col_laurels') / (ec_cat()->>'laurelsPerStep')::integer);
    if idx >= n then raise exception 'Aucun palier à encaisser.' using errcode = '22023'; end if;
    step := ec_cat()->'column'->idx;
    st := ec_set_int(st, 'col_claimed', idx + 1);
    r := jsonb_build_object('step', step || jsonb_build_object('idx', idx));
    if step ? 'chest' then o := ec_chest_open(st, p.elo_peak, step->>'chest'); st := o->'state'; r := r || jsonb_build_object('chest', step->>'chest', 'lots', o->'lots');
    elsif step ? 'jokers' then st := ec_set_int(st, 'jokers', ec_si(st,'jokers') + (step->>'jokers')::integer);
    end if;

  -- Les jokers : tous convertis en une créature possédée (hors Monarque).
  elsif p_action = 'joker' then
    k := arg->>'piece';
    n := ec_si(st,'jokers');
    if n = 0 then raise exception 'Aucun joker à convertir.' using errcode = '22023'; end if;
    if not (k = any(ec_owned(st))) or ec_piece(k)->>'cls' = 'Monarque' then
      raise exception 'Cette créature ne peut pas recevoir de jokers.' using errcode = '22023';
    end if;
    st := ec_inv_add(ec_set_int(st, 'jokers', 0), k, n);
    r := jsonb_build_object('piece', k, 'qty', n);

  -- La rangée de la richesse : des tickets contre des perles.
  elsif p_action = 'wealth' then
    idx := ec_si(st,'rich_claimed');
    step := ec_cat()->'wealth'->idx;
    if step is null then raise exception 'La rangée est complète.' using errcode = '22023'; end if;
    if ec_si(st,'tickets') < (step->>'cost')::integer then raise exception 'Pas assez de tickets.' using errcode = '22023'; end if;
    st := ec_set_int(st, 'tickets', ec_si(st,'tickets') - (step->>'cost')::integer);
    st := ec_set_int(st, 'rich_claimed', idx + 1);
    st := ec_set_int(st, 'pearls', ec_si(st,'pearls') + (step->>'pearls')::integer);
    r := jsonb_build_object('idx', idx, 'pearls', (step->>'pearls')::integer, 'cost', (step->>'cost')::integer);

  -- Un coffre de la Diagonale, gagné en franchissant un jalon.
  elsif p_action = 'voie' then
    k := arg->>'milestone';
    if not (ec_sarr(st,'voie_chests') ? k) then raise exception 'Ce coffre n''est pas à vous.' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(x), '[]'::jsonb) into o from jsonb_array_elements_text(ec_sarr(st,'voie_chests')) x where x <> k;
    st := jsonb_set(st, '{voie_chests}', o);
    select m into step from jsonb_array_elements(ec_cat()->'milestones') m where m->>'id' = k;
    if step is not null and step->>'reward' = 'chest' then
      o := ec_chest_open(st, p.elo_peak, step->>'chest'); st := o->'state';
      r := jsonb_build_object('chest', step->>'chest', 'lots', o->'lots');
    end if;

  -- Éveiller un pouvoir : huit débris dépensés, le pouvoir pour toujours.
  elsif p_action = 'awaken' then
    k := arg->>'piece';
    n := (ec_cat()->>'debrisNeeded')::integer;
    if not ec_has_power(k) or k = any(ec_powers(st)) or not (k = any(ec_unlocked(st)))
       or coalesce((ec_sobj(st,'debris')->>k)::integer,0) < n then
      raise exception 'Il manque encore des débris magiques.' using errcode = '22023';
    end if;
    st := jsonb_set(st, '{debris}', ec_sobj(st,'debris') || jsonb_build_object(k, (ec_sobj(st,'debris')->>k)::integer - n));
    st := ec_add_to_list(st, 'unlocked_powers', k);
    r := jsonb_build_object('piece', k);

  -- Le tutoriel : les trois créatures qu'il enseigne, avec leur pouvoir,
  -- une seule fois chacune.
  elsif p_action = 'tuto' then
    o := '[]'::jsonb;
    for k in select x from jsonb_array_elements_text(case when arg ? 'piece' then jsonb_build_array(arg->>'piece')
                                                          else ec_cat()->'tuto'->'pieces' end) x loop
      if not (ec_cat()->'tuto'->'pieces' ? k) then raise exception 'Pièce hors du tutoriel.' using errcode = '22023'; end if;
      if ec_sarr(st,'tuto_rewards') ? k or k = any(ec_unlocked(st)) then continue; end if;
      o := o || jsonb_build_array(jsonb_build_object('pieceId', k, 'qty', (ec_cat()->'tuto'->>'qty')::integer,
                                                     'isNew', true, 'withPower', true));
      st := ec_add_to_list(st, 'tuto_rewards', k);
    end loop;
    st := ec_apply_lots(st, o);
    r := jsonb_build_object('lots', o);

  else
    raise exception 'Geste inconnu.' using errcode = '22023';
  end if;

  update ec_players set state = st where id = p.id;
  return r || jsonb_build_object('ok', true, 'state', st, 'today', ec_today());
end $$;

-- =================================================================
-- LES PARTIES : ouvertes, déclarées, confrontées, réglées
-- =================================================================
-- Avant, une partie n'existait pour le serveur qu'à sa fin, et sous la
-- forme que le navigateur voulait bien lui donner : « j'ai gagné, contre
-- 4 000 ELO, classée ». Un appel suffisait à monter au classement, une
-- défaite se déclarait « non classée », et fermer l'onglet en pleine
-- partie perdue ne coûtait rien.
--
-- Maintenant :
--   1. ec_match_begin, AVANT le premier coup, ouvre un billet. Le serveur y
--      écrit ce qu'il décide : l'adversaire et son ELO (lus en base, ou au
--      catalogue du laboratoire), classée ou non, l'armée VÉRIFIÉE (pièces
--      possédées, pouvoirs éveillés, budget), les pièces engagées (retirées
--      de l'inventaire tout de suite).
--   2. ec_report_match déclare l'issue. Contre le laboratoire, elle est
--      retenue (ses adversaires disparaîtront avant la sortie du jeu). En
--      ligne, elle est CONFRONTÉE au billet de l'adversaire : chacun reçoit
--      la pire des deux versions pour lui-même (ec_worst) — mentir ne
--      rapporte donc jamais rien au menteur.
--   3. Un billet resté ouvert est un ABANDON : au rechargement du jeu, à
--      l'ouverture d'une autre partie, ou quand l'adversaire a disparu
--      depuis plus de 90 s. Abandonner, c'est perdre — l'ELO et les pièces.
--   4. Le règlement (ec_match_apply) fait tout le reste : ELO, série,
--      statistiques, historique, points de guerre du clan, pièces
--      rendues, lauriers, quêtes, jalons de la Diagonale.

-- L'ordre des issues pour un joueur, et l'issue vue d'en face.
create or replace function public.ec_res_rank(r text) returns integer
language sql immutable as $$ select case r when 'win' then 2 when 'draw' then 1 else 0 end $$;
create or replace function public.ec_res_inv(r text) returns text
language sql immutable as $$ select case r when 'win' then 'loss' when 'loss' then 'win' else 'draw' end $$;
create or replace function public.ec_worst(a text, b text) returns text
language sql immutable as $$ select case when ec_res_rank(a) <= ec_res_rank(b) then a else b end $$;

-- L'ARMÉE, RAMENÉE À SA FORME CANONIQUE : identifiants, pouvoirs limités à
-- ce que l'armée aligne, troupe de pions. C'est sous cette forme qu'on la
-- compare à celle que l'adversaire a vue sur son plateau.
create or replace function public.ec_army_norm(a jsonb) returns jsonb
language plpgsql immutable as $$
declare
  mon text := coalesce(a->'mon'->>'id', a->>'mon');
  gen text := coalesce(a->'gen'->>'id', a->>'gen');
  ex text[];
  pw text[];
begin
  select coalesce(array_agg(coalesce(e->>'id', e#>>'{}') order by ord), array[]::text[]) into ex
    from jsonb_array_elements(case when jsonb_typeof(a->'extras') = 'array' then a->'extras' else '[]'::jsonb end)
         with ordinality t(e, ord);
  select coalesce(array_agg(distinct x order by x), array[]::text[]) into pw
    from jsonb_array_elements_text(case when jsonb_typeof(a->'powers') = 'array' then a->'powers' else '[]'::jsonb end) x
   where x = mon or x = gen or x = any(ex);
  return jsonb_build_object('mon', mon, 'gen', gen, 'extras', to_jsonb(ex), 'powers', to_jsonb(pw),
    'pawns', a->>'pawns', 'placements', case when jsonb_typeof(a->'placements') = 'object' then a->'placements' else null end);
end $$;

-- Ce qu'une armée mobilise : 1 Monarque, 1 Général, et 1 ou 2 exemplaires
-- de chaque créature selon qu'elle se déploie seule ou en paire.
create or replace function public.ec_army_need(a jsonb) returns jsonb
language plpgsql immutable as $$
declare need jsonb := '{}'::jsonb; id text;
begin
  for id in select a->>'mon' union all select a->>'gen' union all select jsonb_array_elements_text(a->'extras') loop
    if ec_ownable(id) then
      need := need || jsonb_build_object(id, coalesce((need->>id)::integer,0)
        + (case when id in (a->>'mon', a->>'gen') then 1 else ec_deploy(id) end));
    end if;
  end loop;
  return need;
end $$;

-- LA VÉRIFICATION D'UNE ARMÉE (mpArmyProblem, js/multiplayer.js, et les
-- règles du compositeur) : refuse avec la phrase à montrer, ou rend
-- l'armée canonique, ses pouvoirs réduits à ceux que le joueur a éveillés.
create or replace function public.ec_army_check(a jsonb, st jsonb, p_admin boolean) returns jsonb
language plpgsql immutable as $$
declare
  n jsonb := ec_army_norm(a);
  ex text[] := ec_text_arr(n->'extras');
  id text; total integer; prim integer; need jsonb; pw jsonb;
begin
  if ec_piece(n->>'mon') is null or ec_piece(n->>'mon')->>'cls' <> 'Monarque' then
    raise exception 'Armée invalide : il lui faut un Monarque.' using errcode = '22023'; end if;
  if ec_piece(n->>'gen') is null or ec_piece(n->>'gen')->>'cls' <> 'Général' then
    raise exception 'Armée invalide : il lui faut un Général.' using errcode = '22023'; end if;
  if coalesce(array_length(ex,1),0) <> 3 or (select count(distinct x) from unnest(ex) x) <> 3 then
    raise exception 'Armée invalide : trois créatures différentes.' using errcode = '22023'; end if;
  foreach id in array ex loop
    if ec_piece(id) is null or ec_piece(id)->>'cls' in ('Monarque','Général') then
      raise exception 'Armée invalide : créature inconnue.' using errcode = '22023'; end if;
  end loop;
  select count(*) into prim from unnest(ex) x where ec_piece(x)->>'cls' = 'Primordiale';
  if prim > 1 then raise exception 'Armée invalide : une Primordiale au plus.' using errcode = '22023'; end if;
  select (ec_piece(n->>'mon')->>'value')::integer + (ec_piece(n->>'gen')->>'value')::integer
         + sum((ec_piece(x)->>'value')::integer) into total from unnest(ex) x;
  if total > (ec_cat()->>'armyBudget')::integer then
    raise exception 'Armée invalide : % points pour % au maximum.', total, ec_cat()->>'armyBudget' using errcode = '22023'; end if;
  if n->>'pawns' is not null and not (ec_cat()->'pawnArmies' ? (n->>'pawns')) then
    raise exception 'Armée invalide : troupe de pions inconnue.' using errcode = '22023'; end if;
  if p_admin then return n; end if;
  need := ec_army_need(n);
  for id in select key from jsonb_each(need) loop
    if ec_inv(st, id) < (need->>id)::integer then
      raise exception 'Stock insuffisant : % (%/%).', ec_piece(id)->>'name', ec_inv(st,id), need->>id using errcode = '22023'; end if;
  end loop;
  -- Les pouvoirs : ceux que le joueur a vraiment éveillés, rien de plus.
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into pw
    from jsonb_array_elements_text(n->'powers') x where x = any(ec_powers(st));
  if not (a ? 'powers') then
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into pw from unnest(ec_powers(st)) x
     where x in (n->>'mon', n->>'gen') or x = any(ex);
  end if;
  return n || jsonb_build_object('powers', pw);
end $$;

-- Deux armées sont-elles la même ? (identifiants et pouvoirs)
create or replace function public.ec_army_same(a jsonb, b jsonb) returns boolean
language sql immutable as $$
  select a->>'mon' = b->>'mon' and a->>'gen' = b->>'gen'
     and (select array_agg(x order by x) from jsonb_array_elements_text(a->'extras') x)
       = (select array_agg(x order by x) from jsonb_array_elements_text(b->'extras') x)
     and coalesce((select array_agg(x order by x) from jsonb_array_elements_text(a->'powers') x), array[]::text[])
       = coalesce((select array_agg(x order by x) from jsonb_array_elements_text(b->'powers') x), array[]::text[])
$$;

-- Ce que le joueur déclare à la fin, BORNÉ : rien de ce qui arrive ici ne
-- peut dépasser ce qu'une vraie partie produirait.
create or replace function public.ec_claim_clean(t public.ec_matches, d jsonb) returns jsonb
language plpgsql immutable as $$
declare
  surv jsonb := '{}'::jsonb; k text; v jsonb;
  ev jsonb := '{}'::jsonb; e text; caps jsonb := '{"move":300,"capture":16,"check":60,"mate":1,"play":300,"promo":8}';
  m jsonb; promos jsonb := '[]'::jsonb; ids text[];
  rp jsonb := d->'replay';
begin
  d := coalesce(d,'{}'::jsonb);
  ids := array[t.army->>'gen'] || ec_text_arr(t.army->'extras');
  for k, v in select * from jsonb_each(case when jsonb_typeof(d->'survivors') = 'object' then d->'survivors' else '{}'::jsonb end) loop
    if t.engaged ? k and jsonb_typeof(v) = 'number' then
      surv := surv || jsonb_build_object(k, greatest(0, least((t.engaged->>k)::integer, (v::text)::numeric::integer)));
    end if;
  end loop;
  for e in select key from jsonb_each(caps) loop
    if jsonb_typeof(d->'events'->e) <> 'object' then continue; end if;
    m := '{}'::jsonb;
    for k, v in select * from jsonb_each(d->'events'->e) loop
      if (k = any(ids) or k = t.army->>'mon') and jsonb_typeof(v) = 'number' then
        m := m || jsonb_build_object(k, greatest(0, least((caps->>e)::integer, (v::text)::numeric::integer)));
      end if;
    end loop;
    ev := ev || jsonb_build_object(e, m);
  end loop;
  -- Une promotion crée un exemplaire d'une pièce de l'armée (Général ou
  -- créature : ce sont les seuls choix que propose la promotion).
  select coalesce(jsonb_agg(x), '[]'::jsonb) into promos from (
    select x from jsonb_array_elements_text(case when jsonb_typeof(d->'promos') = 'array' then d->'promos' else '[]'::jsonb end) x
     where x = any(ids) and ec_ownable(x) limit 8) s;
  if rp is not null and octet_length(rp::text) > 32768 then rp := null; end if;
  return jsonb_build_object('survivors', surv, 'events', ev, 'promos', promos,
    'moves', greatest(0, least(1000, coalesce((d->>'moves')::numeric, 1000)::integer)),
    'replay', rp,
    'opp_army', case when jsonb_typeof(d->'opp_army') = 'object' then ec_army_norm(d->'opp_army') else null end);
end $$;

-- -- LE RÈGLEMENT D'UN BILLET -------------------------------------
-- p_reason : report (issue déclarée), agree (les deux camps d'accord),
-- conflict (désaccord, chacun reçoit le pire), abandon (billet laissé
-- ouvert : défaite), opp-gone (l'adversaire a abandonné), cheat (l'armée
-- adverse n'était pas celle qu'il avait fait vérifier), void (partie
-- annulée : rien ne bouge, les pièces engagées reviennent), short (partie
-- trop courte pour compter), unmatched (en ligne, sans billet adverse).
create or replace function public.ec_match_apply(p_ticket uuid, p_res text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.ec_matches; p public.ec_players;
  counts boolean; rewards boolean;
  calc jsonb; new_elo integer; delta integer := 0; old_elo integer; old_peak integer;
  st jsonb; d jsonb; need jsonb; k text;
  returned jsonb := '{}'::jsonb; lost jsonb := '{}'::jsonb; gained jsonb := '{}'::jsonb;
  back integer; laurels jsonb := null; before integer; after integer; cap integer; per integer;
  q jsonb; ev jsonb; earned integer := 0; ms jsonb; streak integer;
  pstats jsonb; entry jsonb; hist jsonb; clan jsonb := null; v_out jsonb;
begin
  select * into t from ec_matches where id = p_ticket for update;
  if t.settled_at is not null then return t.outcome; end if;
  select * into p from ec_players where id = t.player_id for update;
  if not found then return null; end if;
  d := coalesce(t.claim_data, '{}'::jsonb);
  counts := t.ranked and p_reason not in ('void','short','unmatched');
  rewards := t.mode <> 'tuto' and not p.is_admin and p_reason not in ('abandon','void','short','unmatched');
  old_elo := p.elo; old_peak := p.elo_peak; new_elo := p.elo;

  -- L'ELO, la série, les statistiques par créature.
  if counts then
    calc := ec_elo_calc(p.elo, t.opp_elo, p_res, p.ranked_games);
    new_elo := (calc->>'new_elo')::integer; delta := (calc->>'delta')::integer;
    streak := case when p_res = 'win' then p.cur_streak + 1 else 0 end;
    pstats := p.piece_stats;
    for k in select distinct x from (select t.army->>'mon' x union all select t.army->>'gen'
               union all select jsonb_array_elements_text(t.army->'extras')) s where ec_ownable(x) loop
      pstats := jsonb_set(pstats, array[k], jsonb_build_object(
        'g', coalesce((pstats->k->>'g')::integer,0) + 1,
        'w', coalesce((pstats->k->>'w')::integer,0) + (case when p_res = 'win' then 1 else 0 end)));
    end loop;
  else
    streak := p.cur_streak; pstats := p.piece_stats;
  end if;

  -- LES PIÈCES ENGAGÉES. Défaite : tout est perdu. Victoire ou nulle : les
  -- survivantes rentrent. Partie annulée : tout rentre.
  st := ec_eco_init(p.state, p.elo_peak);
  need := coalesce(t.engaged, '{}'::jsonb);
  for k in select key from jsonb_each(need) loop
    back := case when p_reason = 'void' then (need->>k)::integer
                 when p_res = 'loss' then 0
                 else least(coalesce((d->'survivors'->>k)::integer,0), (need->>k)::integer) end;
    if back > 0 then returned := returned || jsonb_build_object(k, back); end if;
    if (need->>k)::integer - back > 0 then lost := lost || jsonb_build_object(k, (need->>k)::integer - back); end if;
  end loop;
  st := ec_inv_add_map(st, returned);

  if rewards then
    -- Les promotions : un exemplaire créé par pion promu.
    for k in select jsonb_array_elements_text(coalesce(d->'promos','[]'::jsonb)) loop
      st := ec_inv_add(st, k, 1);
      gained := gained || jsonb_build_object(k, coalesce((gained->>k)::integer,0) + 1);
    end loop;
    st := ec_set_int(st, 'win_streak', case when p_res = 'win' then ec_si(st,'win_streak') + 1
                                            when p_res = 'loss' then 0 else ec_si(st,'win_streak') end);
    -- Les lauriers de la colonne des victoires.
    if p_res = 'win' then
      per := (ec_cat()->>'laurelsPerStep')::integer;
      cap := jsonb_array_length(ec_cat()->'column') * per;
      before := least(cap, ec_si(st,'col_laurels'));
      after := least(cap, before + ec_laurels_for((d->>'moves')::integer));
      st := ec_set_int(st, 'col_laurels', after);
      laurels := jsonb_build_object('gain', after - before, 'laurels', after, 'steps', after / per,
        'opened', after / per - before / per, 'moves', (d->>'moves')::integer);
    end if;
    -- Les quêtes : les événements de la partie, plus la victoire elle-même.
    ev := coalesce(d->'events', '{}'::jsonb);
    if p_res <> 'win' then ev := ev - 'mate'; end if;
    if p_res = 'win' then
      ev := ev || jsonb_build_object('win', '{"*":1}'::jsonb,
        'winwith', (select coalesce(jsonb_object_agg(key, 1), '{}'::jsonb) from jsonb_each(need)));
    end if;
    ev := ev || jsonb_build_object('promo', (select coalesce(jsonb_object_agg(x, c), '{}'::jsonb) from
      (select x, count(*) c from jsonb_array_elements_text(coalesce(d->'promos','[]'::jsonb)) x group by x) s));
    q := ec_quests_note(st, ev); st := q->'state'; earned := (q->>'earned')::integer;
  end if;

  -- L'historique : les 30 dernières parties.
  entry := jsonb_build_object(
    'result', p_res, 'oldElo', old_elo, 'newElo', new_elo, 'delta', delta,
    'date', (extract(epoch from now()) * 1000)::bigint,
    'aiElo', t.opp_elo, 'ranked', counts, 'opp', t.opp_name,
    'army', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(t.army->'extras') x),
    'replay', case when p_reason = 'abandon' then 'null'::jsonb else coalesce(d->'replay','null'::jsonb) end,
    'mode', t.mode, 'why', p_reason);
  hist := (select coalesce(jsonb_agg(e), '[]'::jsonb)
             from (select e from jsonb_array_elements(p.history || jsonb_build_array(entry)) e
                   offset greatest(0, jsonb_array_length(p.history) + 1 - 30)) s);

  update ec_players set
    elo          = new_elo,
    elo_peak     = greatest(elo_peak, new_elo),
    ranked_games = ranked_games + (case when counts then 1 else 0 end),
    ranked_wins  = ranked_wins  + (case when counts and p_res = 'win'  then 1 else 0 end),
    ranked_draws = ranked_draws + (case when counts and p_res = 'draw' then 1 else 0 end),
    cur_streak   = streak,
    best_streak  = greatest(best_streak, streak),
    piece_stats  = pstats,
    history      = hist
  where id = p.id returning * into p;

  -- Les jalons de la Diagonale, sur le sommet.
  ms := ec_milestones(st, old_peak, p.elo_peak); st := ms->'state';
  update ec_players set state = st where id = p.id;

  -- LA GUERRE DES CLANS. Étanche : une panne ici ne coûte jamais le
  -- règlement. Un abandon ne rapporte rien au clan.
  if counts and p_reason <> 'abandon' then
    begin
      clan := ec_clan_on_match(p.id, p.username, p_res, old_elo, t.opp_elo, t.mode, t.opp_name);
    exception when others then clan := null;
    end;
  end if;

  v_out := jsonb_build_object('result', p_res, 'reason', p_reason, 'ranked', counts,
    'old_elo', old_elo, 'new_elo', new_elo, 'delta', delta, 'clan', clan,
    'eco', jsonb_build_object('lost', lost, 'returned', returned, 'gained', gained,
      'streak', ec_si(st,'win_streak'), 'laurels', laurels, 'tickets', earned,
      'milestones', ms->'granted'));
  update ec_matches set result = p_res, settled_at = now(), settle_reason = p_reason, outcome = v_out
   where id = t.id;
  return v_out;
end $$;

-- Le billet adverse d'une partie en ligne : même salon, comptes croisés.
create or replace function public.ec_match_peer(t public.ec_matches) returns public.ec_matches
language sql stable security definer set search_path = public as $$
  select * from ec_matches c
   where t.mode = 'ligne' and c.mode = 'ligne' and c.room = t.room
     and c.player_id = t.opp_player and c.opp_player = t.player_id
     and abs(extract(epoch from c.created_at - t.created_at)) <= 120
   order by c.created_at desc limit 1
$$;

-- Le joueur d'un billet a-t-il disparu ? Hors ligne depuis 90 s, passé à
-- une autre partie, ou billet vieux de six heures.
create or replace function public.ec_match_gone(t public.ec_matches) returns boolean
language sql stable security definer set search_path = public as $$
  select now() - t.created_at > interval '6 hours'
      or exists(select 1 from ec_players p where p.id = t.player_id and p.last_seen_at < now() - interval '90 seconds')
      or exists(select 1 from ec_matches n where n.player_id = t.player_id and n.created_at > t.created_at)
$$;

-- ESSAIE DE RÉGLER un billet (et son vis-à-vis en ligne). p_final : le
-- propriétaire du billet est revenu sans l'avoir clos (rechargement, autre
-- partie) — un billet sans déclaration est alors un abandon.
create or replace function public.ec_match_try(p_ticket uuid, p_final boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare t public.ec_matches; c public.ec_matches; rt text; rc text; why text;
begin
  select * into t from ec_matches where id = p_ticket for update;
  if not found or t.settled_at is not null then return; end if;

  if t.mode <> 'ligne' then
    if t.claim is null then
      if p_final or now() - t.created_at > interval '3 hours' then perform ec_match_apply(t.id, 'loss', 'abandon'); end if;
      return;
    end if;
    -- Une partie classée gagnée ou nulle en moins de vingt secondes ne
    -- compte pas : c'est la durée d'un appel forgé, pas d'une bataille.
    if t.ranked and t.claim <> 'loss' and t.claim_at - t.created_at < interval '20 seconds' then
      perform ec_match_apply(t.id, t.claim, 'short');
    else
      perform ec_match_apply(t.id, t.claim, 'report');
    end if;
    return;
  end if;

  c := ec_match_peer(t);
  if c.id is null then
    -- Pas de billet adverse : l'adversaire n'a jamais ouvert la partie (ou
    -- n'était pas celui qu'il prétendait être). Rien ne se classe.
    if t.claim is not null and (p_final or now() - t.created_at > interval '2 minutes') then
      perform ec_match_apply(t.id, t.claim, 'unmatched');
    elsif t.claim is null and (p_final or now() - t.created_at > interval '6 hours') then
      perform ec_match_apply(t.id, 'loss', 'abandon');
    end if;
    return;
  end if;
  perform 1 from ec_matches where id = c.id for update;
  select * into c from ec_matches where id = c.id;

  -- L'adversaire a déjà été réglé (il a abandonné, ou il a déclaré et
  -- nous avons été absents) : son issue décide de la nôtre.
  if c.settled_at is not null then
    -- Sans notre déclaration, on ne sait pas ce qui a survécu : on attend
    -- qu'elle arrive, sauf si c'est nous qui sommes partis.
    if t.claim is null and not p_final then return; end if;
    perform ec_match_apply(t.id, ec_worst(coalesce(t.claim, ec_res_inv(c.result)), ec_res_inv(c.result)),
      case when c.settle_reason = 'abandon' then 'opp-gone' else 'agree' end);
    return;
  end if;

  if t.claim is not null and c.claim is not null then
    -- L'ARMÉE QU'ON A VUE EN FACE est-elle celle que l'adversaire a fait
    -- vérifier ? Sinon, il a joué ce qu'il ne possédait pas : il perd, et
    -- la partie ne coûte rien à l'autre.
    if t.claim_data->'opp_army' is not null and not ec_army_same(t.claim_data->'opp_army', c.army) then
      perform ec_match_apply(c.id, 'loss', 'cheat'); perform ec_match_apply(t.id, t.claim, 'void'); return;
    end if;
    if c.claim_data->'opp_army' is not null and not ec_army_same(c.claim_data->'opp_army', t.army) then
      perform ec_match_apply(t.id, 'loss', 'cheat'); perform ec_match_apply(c.id, c.claim, 'void'); return;
    end if;
    rt := ec_worst(t.claim, ec_res_inv(c.claim));
    rc := ec_worst(c.claim, ec_res_inv(t.claim));
    why := case when rt = t.claim and rc = c.claim then 'agree' else 'conflict' end;
    perform ec_match_apply(t.id, rt, why);
    perform ec_match_apply(c.id, rc, why);
    return;
  end if;

  -- Un seul camp a déclaré : l'autre a-t-il disparu ?
  if t.claim is not null and c.claim is null and ec_match_gone(c) then
    perform ec_match_apply(c.id, 'loss', 'abandon');
    perform ec_match_apply(t.id, ec_worst(t.claim, 'win'), 'opp-gone');
  elsif c.claim is not null and t.claim is null and (p_final or ec_match_gone(t)) then
    perform ec_match_apply(t.id, 'loss', 'abandon');
    perform ec_match_apply(c.id, ec_worst(c.claim, 'win'), 'opp-gone');
  elsif t.claim is null and p_final then
    perform ec_match_apply(t.id, 'loss', 'abandon');
  end if;
end $$;

-- LE BALAYAGE d'un joueur : ses billets en souffrance. p_boot : il vient
-- d'ouvrir le jeu ou une nouvelle partie — ce qui n'a pas été déclaré est
-- abandonné.
create or replace function public.ec_match_sweep(p_player uuid, p_boot boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  for tid in select id from ec_matches where player_id = p_player and settled_at is null order by created_at loop
    perform ec_match_try(tid, p_boot);
  end loop;
end $$;

-- Ce que le jeu affiche d'un billet.
create or replace function public.ec_match_view(p_ticket uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.ec_matches; c public.ec_matches; p public.ec_players;
begin
  select * into t from ec_matches where id = p_ticket;
  select * into p from ec_players where id = t.player_id;
  c := ec_match_peer(t);
  return jsonb_build_object('ticket', t.id, 'status', case when t.settled_at is null then 'pending' else 'settled' end,
    'ranked', t.ranked, 'paired', t.mode <> 'ligne' or c.id is not null,
    'opp_name', t.opp_name, 'opp_elo', t.opp_elo)
    || coalesce(t.outcome, '{}'::jsonb)
    || jsonb_build_object('profile', ec_self(p));
end $$;

-- -- LES PORTES -----------------------------------------------------
-- OUVRIR UNE PARTIE.
--   p_payload : {mode:'ia'|'ligne'|'tuto', ai, opp, room, army}
create or replace function public.ec_match_begin(p_id uuid, p_secret text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.ec_players; o public.ec_players;
  mode text := coalesce(p_payload->>'mode','');
  st jsonb; army jsonb; need jsonb := '{}'::jsonb;
  ranked boolean := false; opp_elo integer := 0; opp_name text; opp uuid; ai text; room text;
  tid uuid; k text;
begin
  p := ec_auth(p_id, p_secret);
  -- Ce qui était resté ouvert est abandonné : on ne joue qu'une partie à la fois.
  perform ec_match_sweep(p.id, true);
  select * into p from ec_players where id = p.id for update;
  perform ec_rate_hit('begin:' || p.id, interval '1 hour', 120, 'Trop de parties lancées en une heure : patientez un peu.');

  if mode = 'tuto' then
    if octet_length(coalesce(p_payload->'army','{}'::jsonb)::text) > 4096 then
      raise exception 'Armée illisible.' using errcode = '22023'; end if;
    insert into ec_matches(player_id, mode, ranked, army) values (p.id, 'tuto', false, ec_army_norm(p_payload->'army'))
    returning id into tid;
    return jsonb_build_object('ticket', tid, 'ranked', false, 'army', ec_army_norm(p_payload->'army'), 'state', p.state);
  end if;

  st := ec_eco_init(p.state, p.elo_peak);
  army := ec_army_check(coalesce(p_payload->'army','{}'::jsonb), st, p.is_admin);

  if mode = 'ia' then
    ai := p_payload->>'ai';
    if ec_cat()->'ai'->ai is null then raise exception 'Adversaire inconnu.' using errcode = '22023'; end if;
    opp_elo := (ec_cat()->'ai'->>ai)::integer; opp_name := ai;
    ranked := not p.is_admin;
  elsif mode = 'ligne' then
    begin opp := (p_payload->>'opp')::uuid; exception when others then opp := null; end;
    room := left(coalesce(p_payload->>'room',''), 120);
    if char_length(room) < 8 then raise exception 'Salon invalide.' using errcode = '22023'; end if;
    select * into o from ec_players where id = opp;
    if o.id is null or o.id = p.id then raise exception 'Adversaire inconnu.' using errcode = '22023'; end if;
    opp_elo := o.elo; opp_name := o.username;
    ranked := not p.is_admin and not o.is_admin;
  else
    raise exception 'Mode de partie inconnu.' using errcode = '22023';
  end if;

  -- LES PIÈCES ENGAGÉES QUITTENT L'INVENTAIRE MAINTENANT : recharger la
  -- page en pleine partie ne rend rien.
  if not p.is_admin then
    need := ec_army_need(army);
    for k in select key from jsonb_each(need) loop st := ec_inv_add(st, k, -(need->>k)::integer); end loop;
  end if;
  update ec_players set state = st where id = p.id;
  insert into ec_matches(player_id, mode, ranked, opp_player, opp_ai, opp_elo, opp_name, room, army, engaged)
  values (p.id, mode, ranked, opp, ai, opp_elo, opp_name, room, army, need)
  returning id into tid;
  return jsonb_build_object('ticket', tid, 'ranked', ranked, 'opp_elo', opp_elo, 'opp_name', opp_name,
                            'army', army, 'engaged', need, 'state', st);
end $$;

-- DÉCLARER L'ISSUE.
--   p_payload : {ticket, result, survivors, moves, events, promos, replay, opp_army}
create or replace function public.ec_report_match(p_id uuid, p_secret text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; t public.ec_matches; res text := p_payload->>'result'; tid uuid;
begin
  p := ec_auth(p_id, p_secret);
  begin tid := (p_payload->>'ticket')::uuid; exception when others then tid := null; end;
  select * into t from ec_matches where id = tid and player_id = p.id for update;
  if not found then raise exception 'EC_TICKET: partie inconnue.' using errcode = 'P0002'; end if;
  if res not in ('win','loss','draw') then
    raise exception 'EC_RESULT: résultat inconnu' using errcode = '22023';
  end if;
  if t.claim is null and t.settled_at is null then
    update ec_matches set claim = res, claim_at = now(), claim_data = ec_claim_clean(t, p_payload)
     where id = t.id;
  end if;
  perform ec_match_try(t.id, false);
  return ec_match_view(t.id);
end $$;

-- OÙ EN EST UNE PARTIE ? (le gagnant en ligne attend la parole de l'autre)
create or replace function public.ec_match_status(p_id uuid, p_secret text, p_ticket uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  p := ec_auth(p_id, p_secret);
  if not exists(select 1 from ec_matches where id = p_ticket and player_id = p.id) then
    raise exception 'EC_TICKET: partie inconnue.' using errcode = 'P0002';
  end if;
  perform ec_match_try(p_ticket, false);
  return ec_match_view(p_ticket);
end $$;

-- -----------------------------------------------------------------
-- CLASSEMENT, RECHERCHE, PROFIL
-- -----------------------------------------------------------------
-- Trois lectures publiques : elles ne demandent aucune authentification
-- (un classement est public par nature) et ne montrent jamais `state`
-- ni le secret d'un compte.
--
-- LES COMPTES ADMIN N'Y FIGURENT PAS, ni ici ni dans la recherche : ils
-- jouent avec tout débloqué et 10 000 ELO, les compter reviendrait à
-- mettre le patron du jeu en tête de son propre tableau.
-- Les comptes sans aucune partie classée non plus : un classement se
-- gagne, il ne s'obtient pas en créant un compte.
create or replace function public.ec_leaderboard(p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare rows jsonb; total integer;
begin
  select count(*) into total from ec_players where not is_admin and ranked_games > 0;
  select coalesce(jsonb_agg(r order by r_rank), '[]'::jsonb) into rows from (
    select row_number() over (order by elo desc, ranked_games desc, created_at) as r_rank,
           jsonb_build_object(
             'rank', row_number() over (order by elo desc, ranked_games desc, created_at),
             'id', id, 'username', username, 'elo', elo, 'elo_peak', elo_peak,
             'ranked_games', ranked_games, 'ranked_wins', ranked_wins,
             'clan_tag', (select c.tag from ec_clan_members m join ec_clans c on c.id = m.clan_id
                           where m.player_id = ec_players.id),
             'online', last_seen_at > now() - ec_online_window()) as r
      from ec_players
     where not is_admin and ranked_games > 0
     order by elo desc, ranked_games desc, created_at
     limit greatest(1, least(200, coalesce(p_limit, 50)))
    offset greatest(0, coalesce(p_offset, 0))
  ) s;
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

-- La place d'un joueur au classement général, comptée sur les mêmes
-- règles que le tableau ci-dessus. null s'il n'y figure pas encore.
create or replace function public.ec_rank_of(p_id uuid) returns integer
language sql security definer set search_path = public stable as $$
  select case when p.is_admin or p.ranked_games = 0 then null else
    (select count(*) + 1 from ec_players o
      where not o.is_admin and o.ranked_games > 0
        and (o.elo > p.elo
             or (o.elo = p.elo and o.ranked_games > p.ranked_games)
             or (o.elo = p.elo and o.ranked_games = p.ranked_games and o.created_at < p.created_at)))
  end from ec_players p where p.id = p_id
$$;

-- Recherche par pseudo. Les joueurs en ligne remontent en tête : on
-- cherche quelqu'un pour LE DÉFIER, autant voir tout de suite qui est
-- disponible.
create or replace function public.ec_search(p_q text, p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := ec_name_key(p_q); rows jsonb;
begin
  if char_length(q) < 1 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(r), '[]'::jsonb) into rows from (
    select jsonb_build_object(
             'id', id, 'username', username, 'elo', elo, 'elo_peak', elo_peak,
             'ranked_games', ranked_games, 'ranked_wins', ranked_wins,
             'clan_tag', (select c.tag from ec_clan_members m join ec_clans c on c.id = m.clan_id
                           where m.player_id = ec_players.id),
             'online', last_seen_at > now() - ec_online_window()) as r
      from ec_players
     where not is_admin
       and username_key like '%' || replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_') || '%'
     order by (last_seen_at > now() - ec_online_window()) desc,
              (username_key = q) desc,
              position(q in username_key),
              elo desc
     limit greatest(1, least(50, coalesce(p_limit, 20)))
  ) s;
  return rows;
end $$;

-- Le profil public d'un joueur, par identifiant ou par pseudo, avec sa
-- place au classement.
create or replace function public.ec_profile(p_id uuid default null, p_username text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  if p_id is not null then
    select * into p from ec_players where id = p_id;
  else
    select * into p from ec_players where username_key = ec_name_key(p_username);
  end if;
  if not found then return jsonb_build_object('found', false); end if;
  return ec_public(p) || jsonb_build_object('found', true, 'rank', ec_rank_of(p.id));
end $$;

-- -----------------------------------------------------------------
-- LA GUERRE DES CLANS
-- -----------------------------------------------------------------
-- La règle tient en quatre phrases, et tout ce qui suit la sert :
--   1. Un joueur appartient à un clan au plus.
--   2. Chaque PARTIE CLASSÉE d'un membre rapporte des POINTS DE GUERRE à
--      son clan : victoire 10 (+ un bonus d'exploit contre plus fort, un
--      malus contre bien plus faible), nulle 4, défaite 1 ; une fois et
--      demie plus contre un humain. Un plafond quotidien empêche qu'un
--      seul membre porte la semaine à lui seul.
--   3. La GUERRE dure une semaine ISO, du lundi 00:00 UTC au suivant :
--      les clans y sont classés sur leurs points de la semaine.
--   4. La semaine finie, chaque membre qui a combattu (10 points au moins
--      pour ce clan) RÉCLAME un coffre, selon la place finale du clan.
--
-- Les catalogues (blasons, devises, cris de guerre) vivent dans le jeu
-- (js/blason.js, js/clans.js) ; le serveur n'en stocke que des NUMÉROS,
-- qu'il borne. C'est la modération par construction du chat de partie :
-- un client bricolé ne peut rien écrire qui ne soit pas déjà dans le jeu.
-- Le nom et le sigle du clan sont les deux seuls textes libres, avec les
-- mêmes règles que les pseudos.

-- La semaine de guerre : semaine ISO, en UTC (« 2026-S40 »).
create or replace function public.ec_week_key(p_at timestamptz default now()) returns text
language plpgsql stable as $$
begin
  return to_char(p_at at time zone 'utc', 'IYYY-"S"IW');
end $$;

-- La fin de la semaine de guerre : le lundi suivant, 00:00 UTC.
create or replace function public.ec_week_end(p_at timestamptz default now()) returns timestamptz
language plpgsql stable as $$
begin
  return (date_trunc('week', p_at at time zone 'utc') + interval '7 days') at time zone 'utc';
end $$;

-- Les constantes de la guerre, à un seul endroit (miroir : CLAN_RULES,
-- js/clans.js).
create or replace function public.ec_clan_max_members() returns integer
language plpgsql immutable as $$ begin return 30; end $$;
create or replace function public.ec_clan_day_cap() returns integer
language plpgsql immutable as $$ begin return 120; end $$;
create or replace function public.ec_clan_claim_min() returns integer
language plpgsql immutable as $$ begin return 10; end $$;
create or replace function public.ec_clan_found_games() returns integer
language plpgsql immutable as $$ begin return 3; end $$;

-- LE NIVEAU DU CLAN, sur ses points cumulés depuis sa fondation. Les sept
-- noms sont ceux des rangs de joueur (Bois → Or Légendaire) : on les
-- connaît déjà, et le métal du cadre du blason les reprend.
create or replace function public.ec_clan_level(p_points bigint) returns integer
language plpgsql immutable as $$
begin
  return case
    when p_points >= 60000 then 6
    when p_points >= 25000 then 5
    when p_points >= 10000 then 4
    when p_points >= 4000  then 3
    when p_points >= 1500  then 2
    when p_points >= 500   then 1
    else 0 end;
end $$;

-- Ce que vaut une partie pour le clan. p_mode : 'ia' (laboratoire) ou
-- 'ligne' (un humain en face), comme l'écrit js/game-flow.js.
create or replace function public.ec_clan_war_points(p_res text, p_elo integer, p_opp integer, p_mode text)
returns integer
language plpgsql immutable as $$
declare pts integer;
begin
  pts := case p_res
    when 'win'  then 10 + greatest(-4, least(10, ec_jsround((p_opp - p_elo) / 50.0)))
    when 'draw' then 4
    else 1 end;
  if p_mode = 'ligne' then pts := ec_jsround(pts * 1.5); end if;
  return pts;
end $$;

-- Le coffre du butin, selon la place finale du clan.
create or replace function public.ec_clan_war_chest(p_rank integer) returns text
language plpgsql immutable as $$
begin
  return case
    when p_rank is null then null
    when p_rank = 1  then 'tour'
    when p_rank <= 3 then 'fou'
    when p_rank <= 10 then 'cavalier'
    else 'pion' end;
end $$;

-- -- VALIDATIONS ---------------------------------------------------
create or replace function public.ec_clan_name_error(p_name text) returns text
language plpgsql immutable as $$
declare n text := btrim(coalesce(p_name,''));
begin
  if char_length(n) < 3 or char_length(n) > 24 then
    return 'Le nom du clan doit faire entre 3 et 24 caractères.';
  end if;
  if n <> regexp_replace(n, '[[:cntrl:]]', '', 'g') then
    return 'Ce nom contient des caractères invisibles.';
  end if;
  return null;
end $$;

create or replace function public.ec_clan_tag_norm(p_tag text) returns text
language plpgsql immutable as $$
begin
  return upper(btrim(coalesce(p_tag,'')));
end $$;

create or replace function public.ec_clan_tag_error(p_tag text) returns text
language plpgsql immutable as $$
begin
  if ec_clan_tag_norm(p_tag) !~ '^[A-Z0-9]{2,4}$' then
    return 'Le sigle fait 2 à 4 lettres ou chiffres, sans accent.';
  end if;
  return null;
end $$;

-- LE BLASON EST UNE LISTE DE NUMÉROS, et le serveur les borne : forme,
-- partition, deux émaux, meuble et son émail. Un champ hors limites
-- retombe à zéro — un blason invalide ne doit pas empêcher de fonder un
-- clan, il doit seulement ne rien pouvoir dessiner d'autre que le jeu.
-- Les tailles sont celles des catalogues de js/blason.js (BLAZON_SPEC).
create or replace function public.ec_clan_blazon_clean(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  spec jsonb := '{"s":5,"d":8,"c1":10,"c2":10,"ch":14,"cc":10}'::jsonb;
  f text; lim integer; v integer; out jsonb := '{}'::jsonb;
begin
  for f, lim in select key, value::integer from jsonb_each_text(spec) loop
    begin
      v := coalesce((p->>f)::integer, 0);
    exception when others then
      v := 0;
    end;
    if v < 0 or v >= lim then v := 0; end if;
    out := out || jsonb_build_object(f, v);
  end loop;
  return out;
end $$;

create or replace function public.ec_clan_motto_clean(p integer) returns integer
language plpgsql immutable as $$
begin
  return case when p is null or p < 0 or p > 15 then 0 else p end;
end $$;

create or replace function public.ec_clan_recruit_clean(p text) returns text
language plpgsql immutable as $$
begin
  return case when p in ('open','request','closed') then p else 'open' end;
end $$;

create or replace function public.ec_clan_min_elo_clean(p integer) returns integer
language plpgsql immutable as $$
begin
  return greatest(0, least(2500, coalesce(p, 0)));
end $$;

-- -- LE JOURNAL ----------------------------------------------------
create or replace function public.ec_clan_log(p_clan uuid, p_kind text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into ec_clan_events(clan_id, kind, data) values (p_clan, p_kind, coalesce(p_data, '{}'::jsonb));
  delete from ec_clan_events
   where clan_id = p_clan
     and id not in (select id from ec_clan_events where clan_id = p_clan order by id desc limit 60);
end $$;

-- -- LECTURES ------------------------------------------------------
-- La place d'un clan dans la guerre d'une semaine. null tant qu'il n'a
-- marqué aucun point : on n'est pas dernier d'une guerre qu'on n'a pas
-- livrée.
create or replace function public.ec_clan_week_rank(p_clan uuid, p_week text) returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  return (select r from (
            select w.clan_id, row_number() over (order by w.points desc, w.wins desc, c.created_at) as r
              from ec_clan_weeks w join ec_clans c on c.id = w.clan_id
             where w.week_key = p_week and w.points > 0) s
           where s.clan_id = p_clan);
end $$;

-- La carte d'un clan : ce que montrent la liste, la recherche et la guerre.
create or replace function public.ec_clan_card(p_clan uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return (select jsonb_build_object(
      'id', c.id, 'name', c.name, 'tag', c.tag, 'blazon', c.blazon, 'motto', c.motto,
      'recruit', c.recruit, 'min_elo', c.min_elo, 'points_total', c.points_total,
      'level', ec_clan_level(c.points_total),
      'members', (select count(*) from ec_clan_members m where m.clan_id = c.id),
      'online', (select count(*) from ec_clan_members m join ec_players p on p.id = m.player_id
                  where m.clan_id = c.id and p.last_seen_at > now() - ec_online_window()),
      'week_points', coalesce((select w.points from ec_clan_weeks w
                                where w.clan_id = c.id and w.week_key = ec_week_key()), 0),
      'week_rank', ec_clan_week_rank(c.id, ec_week_key()),
      'created_at', (extract(epoch from c.created_at) * 1000)::bigint)
    from ec_clans c where c.id = p_clan);
end $$;

create or replace function public.ec_clan_members_json(p_clan uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return (select coalesce(jsonb_agg(x.j order by x.wp desc, x.ro, x.pt desc), '[]'::jsonb) from (
    select jsonb_build_object(
             'id', p.id, 'username', p.username, 'elo', p.elo, 'elo_peak', p.elo_peak,
             'role', m.role, 'points_total', m.points_total,
             'week_points', coalesce(k.points, 0),
             'joined_at', (extract(epoch from m.joined_at) * 1000)::bigint,
             'online', p.last_seen_at > now() - ec_online_window()) as j,
           coalesce(k.points, 0) as wp,
           case m.role when 'chef' then 0 when 'officier' then 1 else 2 end as ro,
           m.points_total as pt
      from ec_clan_members m
      join ec_players p on p.id = m.player_id
      left join ec_clan_contrib k on k.player_id = m.player_id and k.clan_id = m.clan_id
                                 and k.week_key = ec_week_key()
     where m.clan_id = p_clan) x);
end $$;

create or replace function public.ec_clan_events_json(p_clan uuid, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id, 'at', (extract(epoch from e.at) * 1000)::bigint,
             'kind', e.kind, 'data', e.data) order by e.id desc), '[]'::jsonb)
            from (select * from ec_clan_events where clan_id = p_clan
                   order by id desc limit greatest(1, least(60, coalesce(p_limit, 30)))) e);
end $$;

-- Le front d'une semaine : les clans classés sur leurs points.
create or replace function public.ec_clan_war_json(p_week text, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return (select coalesce(jsonb_agg(ec_clan_card(s.clan_id) || jsonb_build_object(
             'rank', s.r, 'points', s.points, 'wins', s.wins, 'games', s.games) order by s.r), '[]'::jsonb)
            from (select w.clan_id, w.points, w.wins, w.games,
                         row_number() over (order by w.points desc, w.wins desc, c.created_at) as r
                    from ec_clan_weeks w join ec_clans c on c.id = w.clan_id
                   where w.week_key = p_week and w.points > 0) s
           where s.r <= greatest(1, least(100, coalesce(p_limit, 20))));
end $$;

-- LE BUTIN DE LA SEMAINE PASSÉE : réclamable ou non, et pourquoi.
create or replace function public.ec_clan_claim_state(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  wk text := ec_week_key(now() - interval '7 days');
  done text; v_clan uuid; v_pts integer; v_rank integer;
begin
  select chest into done from ec_clan_claims where player_id = p_player and week_key = wk;
  if done is not null then
    return jsonb_build_object('week', wk, 'available', false, 'claimed', true, 'chest', done);
  end if;
  select clan_id, points into v_clan, v_pts from ec_clan_contrib
   where player_id = p_player and week_key = wk order by points desc limit 1;
  if v_clan is null or v_pts < ec_clan_claim_min() then
    return jsonb_build_object('week', wk, 'available', false, 'claimed', false,
                              'points', coalesce(v_pts, 0), 'needed', ec_clan_claim_min());
  end if;
  v_rank := ec_clan_week_rank(v_clan, wk);
  return jsonb_build_object('week', wk, 'available', true, 'claimed', false,
    'chest', ec_clan_war_chest(v_rank), 'rank', v_rank, 'points', v_pts,
    'clan', (select jsonb_build_object('name', name, 'tag', tag) from ec_clans where id = v_clan));
end $$;

-- TOUT CE QUE LA PAGE DU CLAN AFFICHE, EN UN SEUL ALLER-RETOUR.
create or replace function public.ec_clan_mine_json(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.ec_clan_members; wk text := ec_week_key();
begin
  select * into m from ec_clan_members where player_id = p_player;
  if m.player_id is null then
    return jsonb_build_object('clan', null,
      'claim', ec_clan_claim_state(p_player),
      'requests_sent', (select coalesce(jsonb_agg(r.clan_id), '[]'::jsonb)
                          from ec_clan_requests r where r.player_id = p_player),
      'week', jsonb_build_object('key', wk,
                'ends_at', (extract(epoch from ec_week_end()) * 1000)::bigint));
  end if;
  return jsonb_build_object(
    'clan', ec_clan_card(m.clan_id),
    'members', ec_clan_members_json(m.clan_id),
    'events', ec_clan_events_json(m.clan_id, 40),
    'requests', case when m.role in ('chef','officier') then
        (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username,
                  'elo', p.elo, 'elo_peak', p.elo_peak,
                  'at', (extract(epoch from r.at) * 1000)::bigint) order by r.at), '[]'::jsonb)
           from ec_clan_requests r join ec_players p on p.id = r.player_id
          where r.clan_id = m.clan_id)
      else '[]'::jsonb end,
    'me', jsonb_build_object('role', m.role, 'points_total', m.points_total,
            'week_points', coalesce((select points from ec_clan_contrib
                                      where player_id = p_player and clan_id = m.clan_id
                                        and week_key = wk), 0),
            'day_points', case when m.day_key = (now() at time zone 'utc')::date
                               then m.day_points else 0 end,
            'day_cap', ec_clan_day_cap()),
    'week', jsonb_build_object('key', wk,
              'ends_at', (extract(epoch from ec_week_end()) * 1000)::bigint),
    'claim', ec_clan_claim_state(p_player));
end $$;

-- -- LA PORTE DE SORTIE, UNIQUE -------------------------------------
-- Quitter, être exclu, supprimer son compte : trois portes, une seule
-- sortie. Si c'était le chef, la couronne passe à l'officier le plus
-- méritant, à défaut au plus ancien membre ; s'il ne reste personne, le
-- clan est dissous (ses semaines, son journal et ses demandes partent
-- avec lui, par cascade).
create or replace function public.ec_clan_remove(p_player uuid, p_kind text, p_by text)
returns void
language plpgsql security definer set search_path = public as $$
declare m public.ec_clan_members; who text; heir uuid;
begin
  select * into m from ec_clan_members where player_id = p_player;
  if m.player_id is null then return; end if;
  select username into who from ec_players where id = p_player;
  delete from ec_clan_members where player_id = p_player;
  if not exists(select 1 from ec_clan_members where clan_id = m.clan_id) then
    delete from ec_clans where id = m.clan_id;
    return;
  end if;
  perform ec_clan_log(m.clan_id, p_kind, jsonb_build_object('who', who, 'by', p_by));
  if m.role = 'chef' then
    select player_id into heir from ec_clan_members
     where clan_id = m.clan_id
     order by (role = 'officier') desc, points_total desc, joined_at
     limit 1;
    update ec_clan_members set role = 'chef' where player_id = heir;
    perform ec_clan_log(m.clan_id, 'role', jsonb_build_object(
      'who', (select username from ec_players where id = heir), 'role', 'chef', 'by', null));
  end if;
end $$;

-- -- LES POINTS DE GUERRE ------------------------------------------
-- Appelée par ec_report_match, après une partie CLASSÉE, et par personne
-- d'autre (voir DROITS : elle n'est pas exposée). Renvoie ce que la
-- partie a rapporté, pour le verdict de fin de partie ; null si le
-- joueur n'a pas de clan.
create or replace function public.ec_clan_on_match(p_player uuid, p_username text, p_res text,
  p_elo integer, p_opp integer, p_mode text, p_opp_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.ec_clan_members; c public.ec_clans;
  wk text := ec_week_key();
  today date := (now() at time zone 'utc')::date;
  raw integer; pts integer; used integer; lvl_before integer;
begin
  select * into m from ec_clan_members where player_id = p_player;
  if m.player_id is null then return null; end if;
  raw := ec_clan_war_points(p_res, p_elo, p_opp, p_mode);
  -- LE PLAFOND QUOTIDIEN. Sans lui, un seul membre qui enchaîne trente
  -- parties contre l'adversaire le plus faible du laboratoire porterait
  -- la guerre de son clan à lui seul ; la semaine se gagnerait au nombre
  -- de parties, plus au nombre de combattants.
  used := case when m.day_key = today then m.day_points else 0 end;
  pts := greatest(0, least(raw, ec_clan_day_cap() - used));
  update ec_clan_members
     set day_key = today, day_points = used + pts, points_total = points_total + pts
   where player_id = p_player;
  select * into c from ec_clans where id = m.clan_id;
  lvl_before := ec_clan_level(c.points_total);
  update ec_clans set points_total = points_total + pts where id = c.id returning * into c;
  insert into ec_clan_weeks(clan_id, week_key, points, wins, games)
       values (c.id, wk, pts, case when p_res = 'win' then 1 else 0 end, 1)
  on conflict (clan_id, week_key) do update
     set points = ec_clan_weeks.points + excluded.points,
         wins   = ec_clan_weeks.wins + excluded.wins,
         games  = ec_clan_weeks.games + 1;
  insert into ec_clan_contrib(player_id, week_key, clan_id, points)
       values (p_player, wk, c.id, pts)
  on conflict (player_id, week_key, clan_id) do update
     set points = ec_clan_contrib.points + excluded.points;
  -- Le journal retient les victoires et les nulles : trente défaites
  -- d'affilée dans le fil d'un clan ne raconteraient rien qu'une
  -- humiliation publique.
  if p_res in ('win','draw') then
    perform ec_clan_log(c.id, p_res, jsonb_build_object('who', p_username, 'opp', p_opp_name,
                                                        'pts', pts, 'mode', p_mode));
  end if;
  if ec_clan_level(c.points_total) > lvl_before then
    perform ec_clan_log(c.id, 'level', jsonb_build_object('level', ec_clan_level(c.points_total)));
  end if;
  return jsonb_build_object('points', pts, 'raw', raw, 'capped', pts < raw,
    'tag', c.tag, 'name', c.name, 'blazon', c.blazon, 'level', ec_clan_level(c.points_total),
    'week_points', (select points from ec_clan_weeks where clan_id = c.id and week_key = wk),
    'week_rank', ec_clan_week_rank(c.id, wk));
end $$;

-- -- LES GESTES ----------------------------------------------------
create or replace function public.ec_clan_create(p_id uuid, p_secret text, p_name text, p_tag text,
  p_blazon jsonb, p_motto integer, p_recruit text, p_min_elo integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; e text; c public.ec_clans;
begin
  p := ec_auth(p_id, p_secret);
  if exists(select 1 from ec_clan_members where player_id = p.id) then
    raise exception 'Vous êtes déjà dans un clan : quittez-le d''abord.' using errcode = '22023';
  end if;
  -- FONDER SE MÉRITE UN PEU. Trois parties classées : de quoi écarter les
  -- comptes créés à la chaîne pour réserver des noms, sans rien coûter à
  -- un vrai joueur.
  if not p.is_admin and p.ranked_games < ec_clan_found_games() then
    raise exception 'Fonder un clan demande % parties classées.', ec_clan_found_games()
      using errcode = '22023';
  end if;
  e := coalesce(ec_clan_name_error(p_name), ec_clan_tag_error(p_tag));
  if e is not null then raise exception '%', e using errcode = '22023'; end if;
  if exists(select 1 from ec_clans where name_key = ec_name_key(p_name)) then
    raise exception 'Ce nom de clan est déjà pris.' using errcode = '23505';
  end if;
  if exists(select 1 from ec_clans where tag = ec_clan_tag_norm(p_tag)) then
    raise exception 'Ce sigle est déjà porté par un autre clan.' using errcode = '23505';
  end if;
  begin
    insert into ec_clans(name, name_key, tag, blazon, motto, recruit, min_elo, created_by)
    values (btrim(p_name), ec_name_key(p_name), ec_clan_tag_norm(p_tag),
            ec_clan_blazon_clean(p_blazon), ec_clan_motto_clean(p_motto),
            ec_clan_recruit_clean(p_recruit), ec_clan_min_elo_clean(p_min_elo), p.id)
    returning * into c;
  exception when unique_violation then
    raise exception 'Ce nom ou ce sigle vient d''être pris.' using errcode = '23505';
  end;
  insert into ec_clan_members(player_id, clan_id, role) values (p.id, c.id, 'chef');
  delete from ec_clan_requests where player_id = p.id;
  perform ec_clan_log(c.id, 'found', jsonb_build_object('who', p.username));
  return ec_clan_mine_json(p.id);
end $$;

create or replace function public.ec_clan_edit(p_id uuid, p_secret text, p_blazon jsonb,
  p_motto integer, p_recruit text, p_min_elo integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; m public.ec_clan_members;
begin
  p := ec_auth(p_id, p_secret);
  select * into m from ec_clan_members where player_id = p.id;
  if m.player_id is null or m.role <> 'chef' then
    raise exception 'Seul le chef peut changer le blason et les règles du clan.' using errcode = '42501';
  end if;
  update ec_clans set blazon = ec_clan_blazon_clean(p_blazon), motto = ec_clan_motto_clean(p_motto),
         recruit = ec_clan_recruit_clean(p_recruit), min_elo = ec_clan_min_elo_clean(p_min_elo)
   where id = m.clan_id;
  perform ec_clan_log(m.clan_id, 'edit', jsonb_build_object('who', p.username));
  return ec_clan_mine_json(p.id);
end $$;

-- REJOINDRE : immédiat si le clan est ouvert, une DEMANDE s'il recrute
-- sur demande, un refus s'il est fermé.
create or replace function public.ec_clan_join(p_id uuid, p_secret text, p_clan uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; c public.ec_clans; n integer;
begin
  p := ec_auth(p_id, p_secret);
  if exists(select 1 from ec_clan_members where player_id = p.id) then
    raise exception 'Vous êtes déjà dans un clan : quittez-le d''abord.' using errcode = '22023';
  end if;
  -- La ligne du clan est verrouillée : deux adhésions simultanées ne
  -- comptent plus les mêmes membres, et le plafond tient.
  select * into c from ec_clans where id = p_clan for update;
  if c.id is null then raise exception 'Ce clan n''existe plus.' using errcode = '22023'; end if;
  if c.recruit = 'closed' then
    raise exception 'Ce clan ne recrute pas.' using errcode = '22023';
  end if;
  -- L'ELO DEMANDÉ SE LIT SUR LE SOMMET, comme tout ce qui se débloque :
  -- un rang atteint ne se reperd pas, une porte franchie non plus.
  if not p.is_admin and p.elo_peak < c.min_elo then
    raise exception 'Ce clan demande % ELO.', c.min_elo using errcode = '22023';
  end if;
  select count(*) into n from ec_clan_members where clan_id = c.id;
  if n >= ec_clan_max_members() then
    raise exception 'Ce clan est complet (% membres).', ec_clan_max_members() using errcode = '22023';
  end if;
  if c.recruit = 'request' then
    insert into ec_clan_requests(clan_id, player_id) values (c.id, p.id)
    on conflict (clan_id, player_id) do update set at = now();
    return ec_clan_mine_json(p.id) || jsonb_build_object('pending', true);
  end if;
  insert into ec_clan_members(player_id, clan_id, role) values (p.id, c.id, 'membre');
  delete from ec_clan_requests where player_id = p.id;
  perform ec_clan_log(c.id, 'join', jsonb_build_object('who', p.username));
  return ec_clan_mine_json(p.id);
end $$;

-- ACCEPTER OU REFUSER UNE DEMANDE : chef et officiers.
create or replace function public.ec_clan_answer(p_id uuid, p_secret text, p_player uuid, p_accept boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; m public.ec_clan_members; who text; n integer;
begin
  p := ec_auth(p_id, p_secret);
  select * into m from ec_clan_members where player_id = p.id;
  if m.player_id is null or m.role not in ('chef','officier') then
    raise exception 'Seuls le chef et les officiers répondent aux demandes.' using errcode = '42501';
  end if;
  perform 1 from ec_clans where id = m.clan_id for update;
  delete from ec_clan_requests where clan_id = m.clan_id and player_id = p_player;
  if not found then raise exception 'Cette demande n''existe plus.' using errcode = '22023'; end if;
  if coalesce(p_accept, false) then
    if exists(select 1 from ec_clan_members where player_id = p_player) then
      raise exception 'Ce joueur a déjà rejoint un autre clan.' using errcode = '22023';
    end if;
    select count(*) into n from ec_clan_members where clan_id = m.clan_id;
    if n >= ec_clan_max_members() then
      raise exception 'Le clan est complet (% membres).', ec_clan_max_members() using errcode = '22023';
    end if;
    insert into ec_clan_members(player_id, clan_id, role) values (p_player, m.clan_id, 'membre');
    delete from ec_clan_requests where player_id = p_player;
    select username into who from ec_players where id = p_player;
    perform ec_clan_log(m.clan_id, 'join', jsonb_build_object('who', who, 'by', p.username));
  end if;
  return ec_clan_mine_json(p.id);
end $$;

create or replace function public.ec_clan_leave(p_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  p := ec_auth(p_id, p_secret);
  if not exists(select 1 from ec_clan_members where player_id = p.id) then
    raise exception 'Vous n''êtes dans aucun clan.' using errcode = '22023';
  end if;
  perform ec_clan_remove(p.id, 'leave', null);
  return ec_clan_mine_json(p.id);
end $$;

-- EXCLURE : le chef exclut qui il veut (sauf lui-même), un officier
-- n'exclut que des membres.
create or replace function public.ec_clan_kick(p_id uuid, p_secret text, p_player uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; m public.ec_clan_members; t public.ec_clan_members;
begin
  p := ec_auth(p_id, p_secret);
  select * into m from ec_clan_members where player_id = p.id;
  select * into t from ec_clan_members where player_id = p_player;
  if m.player_id is null or t.player_id is null or t.clan_id <> m.clan_id or t.player_id = m.player_id then
    raise exception 'Ce joueur n''est pas dans votre clan.' using errcode = '22023';
  end if;
  if not (m.role = 'chef' or (m.role = 'officier' and t.role = 'membre')) then
    raise exception 'Vous n''avez pas le rang pour exclure ce joueur.' using errcode = '42501';
  end if;
  perform ec_clan_remove(p_player, 'kick', p.username);
  return ec_clan_mine_json(p.id);
end $$;

-- CHANGER UN RANG : le chef seul. Nommer un autre chef lui passe la
-- couronne, et l'ancien chef devient officier.
create or replace function public.ec_clan_role(p_id uuid, p_secret text, p_player uuid, p_role text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; m public.ec_clan_members; t public.ec_clan_members; who text;
begin
  p := ec_auth(p_id, p_secret);
  select * into m from ec_clan_members where player_id = p.id;
  select * into t from ec_clan_members where player_id = p_player;
  if m.player_id is null or m.role <> 'chef' then
    raise exception 'Seul le chef distribue les rangs.' using errcode = '42501';
  end if;
  if t.player_id is null or t.clan_id <> m.clan_id or t.player_id = m.player_id then
    raise exception 'Ce joueur n''est pas dans votre clan.' using errcode = '22023';
  end if;
  if p_role not in ('chef','officier','membre') then
    raise exception 'Rang inconnu.' using errcode = '22023';
  end if;
  update ec_clan_members set role = p_role where player_id = p_player;
  if p_role = 'chef' then
    update ec_clan_members set role = 'officier' where player_id = p.id;
  end if;
  select username into who from ec_players where id = p_player;
  perform ec_clan_log(m.clan_id, 'role', jsonb_build_object('who', who, 'role', p_role, 'by', p.username));
  return ec_clan_mine_json(p.id);
end $$;

-- LE CRI DE GUERRE : une phrase du catalogue (js/clans.js, CLAN_CRIES),
-- par son numéro. Une toutes les vingt secondes au plus, par membre.
create or replace function public.ec_clan_cry(p_id uuid, p_secret text, p_cry integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; m public.ec_clan_members;
begin
  p := ec_auth(p_id, p_secret);
  select * into m from ec_clan_members where player_id = p.id;
  if m.player_id is null then
    raise exception 'Vous n''êtes dans aucun clan.' using errcode = '22023';
  end if;
  if p_cry is null or p_cry < 0 or p_cry > 23 then
    raise exception 'Cri inconnu.' using errcode = '22023';
  end if;
  if m.last_cry_at is not null and m.last_cry_at > now() - interval '20 seconds' then
    raise exception 'Laissez retomber l''écho avant de crier à nouveau.' using errcode = '22023';
  end if;
  update ec_clan_members set last_cry_at = now() where player_id = p.id;
  perform ec_clan_log(m.clan_id, 'cry', jsonb_build_object('who', p.username, 'cry', p_cry));
  return jsonb_build_object('events', ec_clan_events_json(m.clan_id, 40));
end $$;

-- RÉCLAMER LE BUTIN DE LA SEMAINE PASSÉE. Le serveur dit quel coffre, et
-- l'OUVRE : le tirage se fait ici comme pour tout coffre (ec_chest_open),
-- le jeu n'en montre que la cérémonie. La clé primaire d'ec_clan_claims
-- fait le reste : un seul par semaine, quoi qu'il arrive.
create or replace function public.ec_clan_claim(p_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; st jsonb; o jsonb;
begin
  p := ec_auth(p_id, p_secret);
  st := ec_clan_claim_state(p.id);
  if coalesce((st->>'claimed')::boolean, false) then
    raise exception 'Ce butin a déjà été réclamé.' using errcode = '23505';
  end if;
  if not coalesce((st->>'available')::boolean, false) then
    raise exception 'Aucun butin à réclamer cette semaine.' using errcode = '22023';
  end if;
  begin
    insert into ec_clan_claims(player_id, week_key, chest, rank)
    values (p.id, st->>'week', st->>'chest', (st->>'rank')::integer);
  exception when unique_violation then
    raise exception 'Ce butin a déjà été réclamé.' using errcode = '23505';
  end;
  select * into p from ec_players where id = p.id for update;
  if p.is_admin then
    return st || jsonb_build_object('ok', true, 'claimed', true, 'available', false, 'lots', '[]'::jsonb);
  end if;
  o := ec_chest_open(ec_eco_init(p.state, p.elo_peak), p.elo_peak, st->>'chest');
  update ec_players set state = o->'state' where id = p.id;
  return st || jsonb_build_object('ok', true, 'claimed', true, 'available', false,
                                  'lots', o->'lots', 'state', o->'state');
end $$;

create or replace function public.ec_clan_mine(p_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  p := ec_auth(p_id, p_secret);
  return ec_clan_mine_json(p.id);
end $$;

-- -- LECTURES PUBLIQUES --------------------------------------------
-- Comme le classement : publiques par nature, sans authentification.

-- Un clan vu de l'extérieur : sa carte, ses membres, son journal récent.
-- Les demandes d'adhésion n'en sortent jamais.
create or replace function public.ec_clan_view(p_clan uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from ec_clans where id = p_clan) then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object('found', true, 'clan', ec_clan_card(p_clan),
    'members', ec_clan_members_json(p_clan),
    'events', ec_clan_events_json(p_clan, 15));
end $$;

-- La liste des clans : sans recherche, ceux qui RECRUTENT et ont encore
-- de la place, les plus actifs de la semaine d'abord. Avec une
-- recherche, tous ceux dont le nom ou le sigle correspond.
create or replace function public.ec_clan_list(p_q text default null, p_limit integer default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := ec_name_key(p_q); t text := ec_clan_tag_norm(p_q);
begin
  return (select coalesce(jsonb_agg(ec_clan_card(s.id) order by s.wp desc, s.pt desc, s.created_at), '[]'::jsonb)
    from (select c.id, c.points_total as pt, c.created_at,
                 coalesce((select w.points from ec_clan_weeks w
                            where w.clan_id = c.id and w.week_key = ec_week_key()), 0) as wp
            from ec_clans c
           where (char_length(q) = 0
                  and c.recruit <> 'closed'
                  and (select count(*) from ec_clan_members m where m.clan_id = c.id) < ec_clan_max_members())
              or (char_length(q) > 0
                  and (c.name_key like '%' || replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_') || '%'
                       or c.tag = t))
           order by wp desc, c.points_total desc, c.created_at
           limit greatest(1, least(60, coalesce(p_limit, 30)))) s);
end $$;

-- LE FRONT : la guerre de la semaine, et le podium de la précédente.
create or replace function public.ec_clan_war(p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'week', ec_week_key(),
    'ends_at', (extract(epoch from ec_week_end()) * 1000)::bigint,
    'rows', ec_clan_war_json(ec_week_key(), p_limit),
    'clans', (select count(*) from ec_clans),
    'last_week', ec_week_key(now() - interval '7 days'),
    'podium', ec_clan_war_json(ec_week_key(now() - interval '7 days'), 3));
end $$;

-- -----------------------------------------------------------------
-- DROITS
-- -----------------------------------------------------------------
-- Postgres donne EXECUTE à PUBLIC sur toute fonction nouvelle, et Supabase
-- y ajoute anon et authenticated. Les fonctions internes étaient retirées
-- une par une — et chaque oubli restait ouvert (ec_hash, ec_clan_card,
-- ec_rank_of…). On ferme donc TOUT, puis on n'ouvre que les portes
-- ci-dessous. Une fonction ajoutée plus tard est fermée tant qu'on ne
-- l'ajoute pas à cette liste.
revoke execute on all functions in schema public from public, anon, authenticated;
-- Les fonctions écrites ici et qui écrivent en base, nommées une à une : le
-- test de fumée vérifie qu'elles restent fermées.
revoke all on function public.ec_clan_on_match(uuid, text, text, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.ec_clan_log(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ec_clan_remove(uuid, text, text) from public, anon, authenticated;
revoke all on function public.ec_match_apply(uuid, text, text) from public, anon, authenticated;
revoke all on function public.ec_match_try(uuid, boolean) from public, anon, authenticated;
revoke all on function public.ec_rate_hit(text, interval, integer, text) from public, anon, authenticated;

grant execute on function
  public.ec_name_free(text),
  public.ec_signup(text, text),
  public.ec_login(uuid, text),
  public.ec_rotate_secret(uuid, text, text),
  public.ec_touch(uuid, text),
  public.ec_rename(uuid, text, text),
  public.ec_delete(uuid, text),
  public.ec_save_state(uuid, text, jsonb),
  public.ec_eco(uuid, text, text, jsonb),
  public.ec_match_begin(uuid, text, jsonb),
  public.ec_report_match(uuid, text, jsonb),
  public.ec_match_status(uuid, text, uuid),
  public.ec_leaderboard(integer, integer),
  public.ec_search(text, integer),
  public.ec_profile(uuid, text),
  public.ec_clan_create(uuid, text, text, text, jsonb, integer, text, integer),
  public.ec_clan_edit(uuid, text, jsonb, integer, text, integer),
  public.ec_clan_join(uuid, text, uuid),
  public.ec_clan_answer(uuid, text, uuid, boolean),
  public.ec_clan_leave(uuid, text),
  public.ec_clan_kick(uuid, text, uuid),
  public.ec_clan_role(uuid, text, uuid, text),
  public.ec_clan_cry(uuid, text, integer),
  public.ec_clan_claim(uuid, text),
  public.ec_clan_mine(uuid, text),
  public.ec_clan_view(uuid),
  public.ec_clan_list(text, integer),
  public.ec_clan_war(integer)
to anon, authenticated;
