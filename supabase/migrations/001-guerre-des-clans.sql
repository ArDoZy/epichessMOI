-- =================================================================
-- EPIC CHESS — MIGRATION 001 : LA GUERRE DES CLANS
-- =================================================================
-- À COLLER UNE FOIS dans l'éditeur SQL du projet Supabase DÉJÀ EN
-- SERVICE (Dashboard > SQL Editor > New query > Run).
--
-- ELLE NE DÉTRUIT RIEN. Pas un DROP, pas un DELETE sur ec_players :
-- les tables des clans sont créées si elles manquent, les fonctions sont
-- remplacées. On peut la rejouer autant de fois qu'on veut.
--
-- Sur une base NEUVE, inutile de la passer : supabase/schema.sql contient
-- déjà tout ce qui suit, mot pour mot (le test de fumée le vérifie —
-- voir « la migration des clans dit la même chose que le schéma »,
-- tools/smoke-test.js). Toucher à une fonction ici, c'est la toucher
-- aussi là-bas.
--
-- CE QU'ELLE AJOUTE
--   · sept tables (clans, membres, semaines de guerre, contributions,
--     journal, demandes d'adhésion, butins réclamés), fermées comme
--     ec_players : RLS sans policy, tout passe par les fonctions ;
--   · les fonctions ec_clan_* (fonder, rejoindre, quitter, exclure,
--     promouvoir, crier, réclamer le butin, lire) ;
--   · les POINTS DE GUERRE : ec_report_match appelle ec_clan_on_match
--     après chaque partie classée, et renvoie ce qu'elle a rapporté ;
--   · le SIGLE du clan dans la fiche du joueur, son profil public, le
--     classement et la recherche.
-- =================================================================

create extension if not exists pgcrypto;

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

-- -----------------------------------------------------------------
-- LA FICHE DU JOUEUR ET SON PROFIL PUBLIC PORTENT SON CLAN
-- -----------------------------------------------------------------
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

-- Suppression définitive d'un compte, par son propriétaire.
-- UN CHEF QUI SUPPRIME SON COMPTE NE LAISSE PAS SON CLAN ORPHELIN : il le
-- quitte d'abord par la porte ordinaire (ec_clan_remove), qui passe la
-- couronne au suivant — ou dissout le clan s'il était seul.
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

-- LE RAPPORT DE FIN DE PARTIE. Le client dit ce qui s'est passé
-- (résultat, ELO de l'adversaire, armée alignée, mode) ; le serveur
-- décide de tout le reste et renvoie la fiche à jour, que le client
-- adopte telle quelle.
--
-- p_payload : {result, opp_elo, opp_name, ranked, mode, army[]}
create or replace function public.ec_report_match(p_id uuid, p_secret text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.ec_players;
  res text := coalesce(p_payload->>'result','loss');
  ranked boolean := coalesce((p_payload->>'ranked')::boolean, true);
  opp_elo integer := greatest(0, least(4000, coalesce((p_payload->>'opp_elo')::integer, 800)));
  calc jsonb;
  new_elo integer;
  delta integer := 0;
  pid text;
  st jsonb;
  entry jsonb;
  hist jsonb;
  streak integer;
  clan jsonb := null;
begin
  p := ec_auth(p_id, p_secret);
  if res not in ('win','loss','draw') then
    raise exception 'EC_RESULT: résultat inconnu' using errcode = '22023';
  end if;
  -- Un compte admin n'est JAMAIS classé : ses parties ne déplacent rien
  -- et ne comptent nulle part (voir aussi ec_leaderboard).
  if p.is_admin then ranked := false; end if;

  new_elo := p.elo;
  if ranked then
    calc := ec_elo_calc(p.elo, opp_elo, res, p.ranked_games);
    new_elo := (calc->>'new_elo')::integer;
    delta := (calc->>'delta')::integer;

    -- La série de victoires, et le record de série : eux aussi sont au
    -- serveur, sinon « meilleure série » n'est qu'un nombre que le
    -- navigateur s'accorde à lui-même.
    streak := case when res = 'win' then p.cur_streak + 1 else 0 end;

    -- Les statistiques par créature. Une créature alignée en double ne
    -- compte qu'une fois : on mesure les PARTIES où elle a joué.
    st := p.piece_stats;
    for pid in
      select distinct v from jsonb_array_elements_text(
        coalesce(p_payload->'army','[]'::jsonb)) v
       where v is not null and v <> ''
    loop
      st := jsonb_set(st, array[pid], jsonb_build_object(
        'g', coalesce((st->pid->>'g')::integer, 0) + 1,
        'w', coalesce((st->pid->>'w')::integer, 0) + (case when res = 'win' then 1 else 0 end)));
    end loop;
  else
    streak := p.cur_streak;
    st := p.piece_stats;
  end if;

  -- L'historique : les 30 dernières parties, classées ou non.
  -- `replay` : de quoi REJOUER la partie coup par coup (les deux armées, la
  -- couleur du joueur, la liste compacte des coups — voir replayNote dans
  -- js/rules-engine.js). Une ligne d'historique ne portait qu'un résultat et
  -- un écart d'ELO : on ne pouvait relire aucune partie, ni la sienne ni
  -- celle de quelqu'un qu'on s'apprête à défier. Deux cents octets par
  -- partie, trente parties gardées : c'est le poste le moins cher de la
  -- table, et le seul qui rende l'historique consultable.
  entry := jsonb_build_object(
    'result', res, 'oldElo', p.elo, 'newElo', new_elo, 'delta', delta,
    'date', (extract(epoch from now()) * 1000)::bigint,
    'aiElo', opp_elo, 'ranked', ranked,
    'opp', p_payload->>'opp_name',
    'army', coalesce(p_payload->'army','[]'::jsonb),
    'replay', coalesce(p_payload->'replay', 'null'::jsonb),
    'mode', coalesce(p_payload->>'mode','ia'));
  hist := (select coalesce(jsonb_agg(e), '[]'::jsonb)
             from (select e from jsonb_array_elements(p.history || jsonb_build_array(entry)) e
                   offset greatest(0, jsonb_array_length(p.history) + 1 - 30)) s);

  update ec_players set
    elo          = new_elo,
    elo_peak     = greatest(elo_peak, new_elo),
    ranked_games = ranked_games + (case when ranked then 1 else 0 end),
    ranked_wins  = ranked_wins  + (case when ranked and res = 'win'  then 1 else 0 end),
    ranked_draws = ranked_draws + (case when ranked and res = 'draw' then 1 else 0 end),
    cur_streak   = streak,
    best_streak  = greatest(best_streak, streak),
    piece_stats  = st,
    history      = hist,
    last_seen_at = now()
  where id = p.id returning * into p;

  -- LA GUERRE DES CLANS. Une partie classée rapporte des points de guerre
  -- au clan du joueur (ec_clan_on_match). Le bloc est ÉTANCHE : une panne
  -- de la guerre des clans ne doit jamais coûter un rapport de partie —
  -- l'ELO est enregistré plus haut, et une exception ici n'annule que ce
  -- qui touche aux clans.
  if ranked then
    begin
      clan := ec_clan_on_match(p.id, p.username, res, (entry->>'oldElo')::integer, opp_elo,
                               coalesce(p_payload->>'mode','ia'), p_payload->>'opp_name');
    exception when others then
      clan := null;
    end;
  end if;

  return jsonb_build_object('profile', ec_self(p), 'delta', delta,
                            'old_elo', (entry->>'oldElo')::integer,
                            'new_elo', new_elo, 'ranked', ranked, 'clan', clan);
end $$;

-- Le classement et la recherche portent le SIGLE du clan de chaque
-- joueur : c'est ce qui fait exister les clans hors de leur page.
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
       and username_key like '%' || replace(replace(q,'\','\\'),'%','\%') || '%'
     order by (last_seen_at > now() - ec_online_window()) desc,
              (username_key = q) desc,
              position(q in username_key),
              elo desc
     limit greatest(1, least(50, coalesce(p_limit, 20)))
  ) s;
  return rows;
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
  select * into c from ec_clans where id = p_clan;
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

-- RÉCLAMER LE BUTIN DE LA SEMAINE PASSÉE. Le serveur dit QUEL coffre ;
-- c'est le jeu qui l'ouvre (chestOpenNow, js/economy-ui.js), comme tout
-- coffre gagné. La clé primaire d'ec_clan_claims fait le reste : un seul
-- par semaine, quoi qu'il arrive.
create or replace function public.ec_clan_claim(p_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; st jsonb;
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
  return st || jsonb_build_object('ok', true, 'claimed', true, 'available', false);
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
                  and (c.name_key like '%' || replace(replace(q,'\','\\'),'%','\%') || '%'
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
-- LE PIÈGE À CONNAÎTRE : Postgres donne EXECUTE à PUBLIC sur toute
-- fonction nouvelle, et Supabase y ajoute anon et authenticated par ses
-- privilèges par défaut. Une fonction interne qui ÉCRIT —
-- ec_clan_on_match, ec_clan_log, ec_clan_remove — serait donc appelable
-- par n'importe qui avec la clé publique du jeu : on se donnerait des
-- points de guerre en une requête. Elles sont retirées une par une.
revoke all on function public.ec_clan_on_match(uuid, text, text, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.ec_clan_log(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ec_clan_remove(uuid, text, text) from public, anon, authenticated;
revoke all on function public.ec_clan_mine_json(uuid) from public, anon, authenticated;
revoke all on function public.ec_clan_claim_state(uuid) from public, anon, authenticated;
revoke all on function public.ec_clan_brief(uuid) from public, anon, authenticated;
revoke all on function public.ec_self(public.ec_players) from public, anon, authenticated;
revoke all on function public.ec_public(public.ec_players) from public, anon, authenticated;

grant execute on function
  public.ec_delete(uuid, text),
  public.ec_report_match(uuid, text, jsonb),
  public.ec_leaderboard(integer, integer),
  public.ec_search(text, integer),
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
