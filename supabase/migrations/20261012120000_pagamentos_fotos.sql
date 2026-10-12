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
