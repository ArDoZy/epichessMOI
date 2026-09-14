-- =================================================================
-- EPIC CHESS — LE SERVEUR FAIT AUTORITÉ
-- =================================================================
-- À COLLER EN ENTIER dans l'éditeur SQL du projet Supabase
-- (Dashboard > SQL Editor > New query > Run). Le script est
-- IDEMPOTENT : on peut le rejouer à volonté, il reconstruit tout.
--
-- ATTENTION : la première instruction EFFACE LA TABLE DES JOUEURS.
-- C'est voulu — la remise à zéro demandée (« supprime tous les anciens
-- comptes ») se fait ici, et une seule fois. Si vous rejouez ce script
-- plus tard pour mettre à jour les fonctions, COMMENTEZ le DROP TABLE :
-- sans cela vous effacerez tous les comptes existants.
--
-- -- CE QUE CE FICHIER GARANTIT ------------------------------------
--
-- 1. AUCUN ACCÈS DIRECT À LA TABLE. RLS est activé et il n'existe
--    AUCUNE policy : la clé publishable du jeu ne peut donc ni lire ni
--    écrire une seule ligne de ec_players. Tout passe par les fonctions
--    ec_* ci-dessous, déclarées SECURITY DEFINER, qui sont la seule
--    porte d'entrée — et qui valident tout ce qui les traverse.
--
-- 2. LE CLIENT NE CHOISIT PAS SON CLASSEMENT. Le navigateur ne peut pas
--    écrire elo, elo_peak, ranked_games, ranked_wins, best_streak,
--    piece_stats ni l'historique : il déclare un RÉSULTAT de partie
--    (ec_report_match), et c'est le serveur qui recalcule le nouvel ELO
--    avec la formule ci-dessous — la même que js/voie.js, au point près.
--    Un joueur qui trafiquerait son localStorage ne gagne rien.
--
-- 3. LES PSEUDOS SONT UNIQUES POUR TOUT LE MONDE. Contrainte UNIQUE sur
--    username_key (le pseudo replié en minuscules, espaces normalisés) :
--    deux comptes ne peuvent plus porter le même nom, même sur deux
--    appareils différents.
--
-- 4. LES COMPTES ADMIN NE SONT JAMAIS CLASSÉS. is_admin = true : leurs
--    parties ne sont pas comptabilisées et ils n'apparaissent ni au
--    classement, ni dans la recherche.
--    Pour promouvoir un compte :
--      update ec_players set is_admin = true where username_key = 'mon pseudo';
--
-- 5. QUI EST EN LIGNE. Chaque appel authentifié rafraîchit last_seen_at ;
--    le jeu bat la mesure toutes les 30 s (ec_touch). « En ligne » =
--    vu il y a moins de EC_ONLINE_WINDOW.
-- =================================================================

-- ⚠️ EFFACE TOUS LES ANCIENS COMPTES (voir l'en-tête). À commenter si
-- vous rejouez ce script sur une base déjà en service.
drop table if exists public.ec_players cascade;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------
-- LA TABLE DES JOUEURS
-- -----------------------------------------------------------------
-- Les colonnes nommées sont celles dont le SERVEUR est propriétaire :
-- le client ne les écrit jamais. `state` est le fourre-tout de la
-- progression que le client pilote (inventaire, perles, coffres,
-- armées, tutoriel, réglages de compte…) : le serveur la stocke et la
-- sert, mais ne l'interprète pas.
create table public.ec_players(
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

create index ec_players_elo_idx  on public.ec_players(elo desc, ranked_games desc, created_at);
create index ec_players_seen_idx on public.ec_players(last_seen_at desc);

-- Verrouillage total : RLS actif, aucune policy. Personne n'entre par la
-- table, tout le monde passe par les fonctions.
alter table public.ec_players enable row level security;
revoke all on public.ec_players from anon, authenticated;

-- -----------------------------------------------------------------
-- OUTILS INTERNES
-- -----------------------------------------------------------------

-- Fenêtre de présence : au-delà, un joueur est considéré hors ligne.
create or replace function public.ec_online_window() returns interval
language sql immutable as $$ select interval '75 seconds' $$;

-- La clé d'unicité d'un pseudo : minuscules, espaces intérieurs
-- ramenés à un seul, bords rognés. « Bob  L'Alchimiste » et
-- « bob l'alchimiste » sont donc le MÊME nom, ce qui est le seul
-- comportement honnête : deux comptes qu'on ne peut pas distinguer à
-- l'oeil ne doivent pas coexister.
create or replace function public.ec_name_key(p_name text) returns text
language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g'))
$$;

-- Validation d'un pseudo. Renvoie null si tout va bien, sinon la phrase
-- à montrer au joueur — les mêmes règles que le client, mais c'est
-- CELLE-CI qui fait foi.
create or replace function public.ec_name_error(p_name text) returns text
language plpgsql immutable as $$
declare n text := btrim(coalesce(p_name,''));
begin
  if char_length(n) < 2 or char_length(n) > 20 then
    return 'Le pseudo doit faire entre 2 et 20 caractères.';
  end if;
  -- [[:cntrl:]] : la classe POSIX des caractères de contrôle. On évite
  -- les échappements \x, dont le support varie selon les versions.
  if n <> regexp_replace(n, '[[:cntrl:]]', '', 'g') then
    return 'Ce pseudo contient des caractères invisibles.';
  end if;
  return null;
end $$;

create or replace function public.ec_hash(p_secret text) returns text
language sql immutable as $$
  select encode(digest('epicchess:' || coalesce(p_secret,''), 'sha256'), 'hex')
$$;

-- Authentification : l'identifiant du compte et son secret, tel que le
-- navigateur les garde. Pas de mot de passe à retenir — le secret est
-- tiré au sort à la création et ne quitte jamais l'appareil.
create or replace function public.ec_auth(p_id uuid, p_secret text)
returns public.ec_players
language plpgsql security definer set search_path = public as $$
declare p public.ec_players;
begin
  select * into p from ec_players where id = p_id;
  if not found or p.secret_hash <> ec_hash(p_secret) then
    raise exception 'EC_AUTH: compte inconnu ou clé invalide' using errcode = '28000';
  end if;
  update ec_players set last_seen_at = now() where id = p_id;
  p.last_seen_at := now();
  return p;
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
--   pub_unlocked  les pièces débloquées : le catalogue dont il dispose,
--                 dont se déduisent les pouvoirs qu'il connaît.
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
  if coalesce(p_secret,'') = '' or char_length(p_secret) < 16 then
    raise exception 'EC_SECRET: clé d''appareil manquante' using errcode = '22023';
  end if;
  begin
    insert into ec_players(username, username_key, secret_hash)
    values (btrim(p_username), ec_name_key(p_username), ec_hash(p_secret))
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
  return ec_self(p);
end $$;

-- Battement de présence : c'est lui qui allume la pastille « en ligne »
-- pour les autres joueurs. Renvoie le nombre de joueurs actuellement
-- connectés, de quoi l'afficher sans un second aller-retour.
create or replace function public.ec_touch(p_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; n integer;
begin
  p := ec_auth(p_id, p_secret);
  select count(*) into n from ec_players
   where last_seen_at > now() - ec_online_window() and not is_admin;
  return jsonb_build_object('ok', true, 'online', n);
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
  delete from ec_players where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

-- -----------------------------------------------------------------
-- LA PROGRESSION QUE LE CLIENT PILOTE
-- -----------------------------------------------------------------
-- Inventaire, perles, coffres, armées, tutoriel… Le serveur les
-- conserve et les sert : c'est LUI qui les détient, plus le navigateur.
-- Il refuse en revanche tout ce qui touche au classement — ces clés-là
-- ne s'obtiennent que par ec_report_match.
create or replace function public.ec_save_state(p_id uuid, p_secret text, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.ec_players; clean jsonb;
begin
  p := ec_auth(p_id, p_secret);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', true);
  end if;
  clean := p_patch
    - 'elo' - 'elo_peak' - 'ranked_games' - 'ranked_wins' - 'best_streak'
    - 'piece_stats' - 'match_history' - 'rank_max';
  update ec_players set state = state || clean, last_seen_at = now()
   where id = p.id returning * into p;
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
  if p_result = 'win' then
    d := greatest(1, ec_jsround(raw * gain));
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

  return jsonb_build_object('profile', ec_self(p), 'delta', delta,
                            'old_elo', (entry->>'oldElo')::integer,
                            'new_elo', new_elo, 'ranked', ranked);
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
-- DROITS
-- -----------------------------------------------------------------
-- Seules ces fonctions sont appelables avec la clé publishable du jeu.
-- Tout le reste — la table elle-même — reste hors d'atteinte.
revoke all on function public.ec_auth(uuid, text) from public, anon, authenticated;
revoke all on function public.ec_self(public.ec_players) from public, anon, authenticated;
revoke all on function public.ec_public(public.ec_players) from public, anon, authenticated;

grant execute on function
  public.ec_name_free(text),
  public.ec_signup(text, text),
  public.ec_login(uuid, text),
  public.ec_touch(uuid, text),
  public.ec_rename(uuid, text, text),
  public.ec_delete(uuid, text),
  public.ec_save_state(uuid, text, jsonb),
  public.ec_report_match(uuid, text, jsonb),
  public.ec_leaderboard(integer, integer),
  public.ec_search(text, integer),
  public.ec_profile(uuid, text)
to anon, authenticated;
