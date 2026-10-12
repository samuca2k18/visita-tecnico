-- Esquema completo do Visita (estado atual do banco).
-- Projeto novo: cole no SQL Editor do Supabase e rode uma vez.
-- Projeto existente: aplique só os arquivos de supabase/migrations que faltarem.
-- Auth: e-mail + senha. O cadastro passa pela função criar-conta (supabase/functions).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null default 'Meu serviço',
  phone text default '',
  pix_key text default '',
  city text default 'Fortaleza'
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  client_name text not null,
  client_phone text default '',
  address text default '',
  service_name text not null,
  description text default '',
  price_cents integer not null,
  status text not null default 'sent' check (status in ('sent','approved','rejected','done','paid')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quotes add column if not exists items jsonb not null default '[]'::jsonb;

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.quotes enable row level security;

-- Perfil criado sozinho no cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfil: campos que antes ficavam só no navegador.
alter table public.profiles add column if not exists cnpj text not null default '';
alter table public.profiles add column if not exists address_line text not null default '';
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists owner_name text not null default '';
alter table public.profiles add column if not exists logo_data text not null default '';
do $$ begin
  alter table public.profiles add constraint profiles_logo_size check (length(logo_data) <= 200000);
exception when duplicate_object then null; end $$;

-- Orçamento: prazo e pagamento.
alter table public.quotes add column if not exists deadline text not null default '';
alter table public.quotes add column if not exists payment text not null default '';

-- Índices das chaves estrangeiras.
create index if not exists quotes_user_id_idx on public.quotes (user_id);
create index if not exists services_user_id_idx on public.services (user_id);

-- RLS com auth.uid() avaliado uma vez por consulta.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "own services" on public.services;
create policy "own services" on public.services
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own quotes" on public.quotes;
create policy "own quotes" on public.quotes
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Link do cliente: tudo que o papel precisa, nada além.
create or replace function public.get_quote(t text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select to_json(q) from (
    select
      quotes.token, quotes.client_name, quotes.address, quotes.service_name,
      quotes.description, quotes.price_cents, quotes.status, quotes.scheduled_at,
      quotes.items, quotes.deadline, quotes.payment, quotes.created_at,
      profiles.business_name, profiles.pix_key, profiles.phone as business_phone,
      profiles.city, profiles.cnpj, profiles.address_line, profiles.email,
      profiles.owner_name, profiles.logo_data
    from quotes
    join profiles on profiles.id = quotes.user_id
    where quotes.token = t
  ) q;
$$;

create or replace function public.client_set_status(t text, new_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_status not in ('approved','rejected') then
    raise exception 'status invalido';
  end if;
  update quotes
    set status = new_status, updated_at = now()
    where token = t and status = 'sent';
  return public.get_quote(t);
end;
$$;

revoke execute on function public.get_quote(text) from public;
revoke execute on function public.client_set_status(text, text) from public;
grant execute on function public.get_quote(text) to anon, authenticated;
grant execute on function public.client_set_status(text, text) to anon, authenticated;

-- Limite de cadastro da função criar-conta. Só a service_role mexe.
create table if not exists public.signup_attempts (
  id bigint generated always as identity primary key,
  ip text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists signup_attempts_ip_idx on public.signup_attempts (ip, created_at);
create index if not exists signup_attempts_email_idx on public.signup_attempts (email, created_at);
alter table public.signup_attempts enable row level security;
revoke all on public.signup_attempts from anon, authenticated;
