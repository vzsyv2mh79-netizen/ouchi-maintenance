-- Disposable CI database only; never applied to a shared Supabase project.
create schema if not exists auth;
create extension if not exists pgcrypto;
