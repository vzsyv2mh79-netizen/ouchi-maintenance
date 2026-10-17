-- Disposable CI database only; never applied to a shared Supabase project.
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- GoTrue queries unqualified relations; keep every connection in auth.
alter role postgres in database auth_test set search_path = auth, public;
