-- Cole no SQL Editor do Supabase. Rode uma vez.
-- Auth: email + senha, em Authentication > Providers > Email.

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

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.quotes enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own services" on public.services
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own quotes" on public.quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.quotes add column if not exists items jsonb not null default '[]'::jsonb;

create or replace function public.get_quote(t text)
returns json
language sql
security definer
set search_path = public
as $$
  select to_json(q) from (
    select
      quotes.token, quotes.client_name, quotes.address, quotes.service_name,
      quotes.description, quotes.price_cents, quotes.status, quotes.scheduled_at,
      quotes.items,
      profiles.business_name, profiles.pix_key, profiles.phone as business_phone
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
declare r json;
begin
  if new_status not in ('approved','rejected') then
    raise exception 'status invalido';
  end if;
  update quotes
    set status = new_status, updated_at = now()
    where token = t and status = 'sent';
  r := public.get_quote(t);
  return r;
end;
$$;

grant execute on function public.get_quote(text) to anon, authenticated;
grant execute on function public.client_set_status(text, text) to anon, authenticated;
