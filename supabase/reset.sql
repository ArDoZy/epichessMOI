-- =================================================================
-- EPIC CHESS — REMISE À ZÉRO COMPLÈTE
-- =================================================================
-- EFFACE TOUS LES COMPTES, TOUS LES CLANS, TOUTES LES PARTIES.
-- Irréversible. À ne coller dans l'éditeur SQL de Supabase que pour
-- repartir d'une base vide, PUIS coller supabase/schema.sql.
--
-- Ces lignes vivaient en tête de schema.sql : rejouer le schéma pour
-- mettre à jour une fonction effaçait toute la base. Elles sont ici,
-- seules, pour que ce geste-là ne se fasse jamais par mégarde.
-- =================================================================
drop table if exists public.ec_rate cascade;
drop table if exists public.ec_matches cascade;
drop table if exists public.ec_clan_claims cascade;
drop table if exists public.ec_clan_requests cascade;
drop table if exists public.ec_clan_events cascade;
drop table if exists public.ec_clan_contrib cascade;
drop table if exists public.ec_clan_weeks cascade;
drop table if exists public.ec_clan_members cascade;
drop table if exists public.ec_clans cascade;
drop table if exists public.ec_players cascade;
