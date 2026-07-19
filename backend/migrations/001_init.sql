-- Ajaia Collaborative Docs — initial schema
-- Run this in the Supabase SQL editor (or psql against the project DB).
-- Authorization is enforced in the FastAPI backend, NOT via RLS: the backend
-- connects with privileged credentials and checks ownership/sharing in code.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key,               -- equals auth.users.id (JWT "sub")
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Untitled document',
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,  -- TipTap JSON
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  unique (document_id, shared_with)
);

create index if not exists documents_owner_updated_idx
  on public.documents (owner_id, updated_at desc);
create index if not exists document_shares_shared_with_idx
  on public.document_shares (shared_with);
