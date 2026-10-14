-- Auditoria de segurança 2026-10-14
-- 1) Funções SECURITY DEFINER com search_path vazio e nomes qualificados.
create or replace function public.get_quote(t text)
returns json language sql stable security definer set search_path = '' as $$
  select to_json(q) from (
    select
      quotes.token, quotes.client_name, quotes.address, quotes.service_name,
      quotes.description, quotes.price_cents, quotes.status, quotes.scheduled_at,
      quotes.items, quotes.deadline, quotes.payment, quotes.created_at,
      profiles.business_name, profiles.pix_key, profiles.phone as business_phone,
      profiles.city, profiles.cnpj, profiles.address_line, profiles.email,
      profiles.owner_name, profiles.logo_data
    from public.quotes
    join public.profiles on profiles.id = quotes.user_id
    where length(t) between 12 and 64 and quotes.token = t
  ) q;
$$;

create or replace function public.client_set_status(t text, new_status text)
returns json language plpgsql security definer set search_path = '' as $$
begin
  if new_status not in ('approved','rejected') then
    raise exception 'status invalido';
  end if;
  if length(t) not between 12 and 64 then
    return null;
  end if;
  update public.quotes
    set status = new_status, updated_at = now()
    where token = t and status = 'sent';
  return public.get_quote(t);
end;
$$;

revoke all on function public.get_quote(text) from public;
revoke all on function public.client_set_status(text, text) from public;
grant execute on function public.get_quote(text) to anon, authenticated;
grant execute on function public.client_set_status(text, text) to anon, authenticated;

-- 2) Logo só pode ser imagem embutida (evita link externo rastreando o cliente) e com tamanho limitado.
alter table public.profiles drop constraint if exists profiles_logo_data_safe;
alter table public.profiles add constraint profiles_logo_data_safe
  check (logo_data is null or logo_data = '' or (logo_data ~ '^data:image/(jpeg|png|webp);base64,' and length(logo_data) <= 400000)) not valid;

-- 3) signup_attempts: só o service_role acessa (política explícita de negação para anon/authenticated).
revoke all on table public.signup_attempts from anon, authenticated;
