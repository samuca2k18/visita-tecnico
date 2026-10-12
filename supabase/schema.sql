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

-- Relatório do mês e fotos da visita (out/2026).

-- Quando o orçamento foi pago: base do "faturado no mês".
alter table public.quotes add column if not exists paid_at timestamptz;
update public.quotes set paid_at = updated_at where status = 'paid' and paid_at is null;
create index if not exists quotes_user_paid_idx on public.quotes (user_id, paid_at);
create index if not exists quotes_user_created_idx on public.quotes (user_id, created_at);

create or replace function public.quotes_paid_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.status <> 'paid' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.quotes_paid_at() from public, anon, authenticated;
drop trigger if exists quotes_paid_at on public.quotes;
create trigger quotes_paid_at before insert or update of status on public.quotes
  for each row execute function public.quotes_paid_at();

-- Fotos: arquivo no Storage (bucket privado) + registro aqui.
-- Caminho: <user_id>/<token do orçamento>/<id>.jpg
create table if not exists public.quote_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quote_token text not null references public.quotes(token) on delete cascade on update cascade,
  kind text not null check (kind in ('antes','depois')),
  path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists quote_photos_token_idx on public.quote_photos (quote_token);
create index if not exists quote_photos_user_idx on public.quote_photos (user_id);
alter table public.quote_photos enable row level security;

drop policy if exists "own photos" on public.quote_photos;
create policy "own photos" on public.quote_photos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.quotes q where q.token = quote_token and q.user_id = (select auth.uid()))
    and path like (select auth.uid())::text || '/' || quote_token || '/%'
  );

-- No máximo 8 fotos por orçamento.
create or replace function public.quote_photos_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.quote_photos where quote_token = new.quote_token) >= 8 then
    raise exception 'limite de 8 fotos por orçamento';
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_photos_limit() from public, anon, authenticated;
drop trigger if exists quote_photos_limit on public.quote_photos;
create trigger quote_photos_limit before insert on public.quote_photos
  for each row execute function public.quote_photos_limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-visita', 'fotos-visita', false, 1572864, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Só o dono lê, envia e apaga, e só dentro da pasta de um orçamento dele.
drop policy if exists "fotos dono le" on storage.objects;
create policy "fotos dono le" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-visita' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "fotos dono envia" on storage.objects;
create policy "fotos dono envia" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-visita'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.quotes q where q.token = (storage.foldername(name))[2] and q.user_id = (select auth.uid()))
  );
drop policy if exists "fotos dono apaga" on storage.objects;
create policy "fotos dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-visita' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- O cliente (sem login) vê as fotos pela função fotos-cliente, que confere o token
-- e devolve links assinados de 1 hora. Nenhuma política para anon.
