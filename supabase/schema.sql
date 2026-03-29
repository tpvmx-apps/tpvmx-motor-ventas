create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null unique,
  destination text,
  entry_date date not null default ((now() at time zone 'utc')::date),
  last_message text,
  advisor text,
  next_action text,
  follow_up_date date,
  notes text,
  status text not null default 'Nuevos' check (status in ('Nuevos', 'Pendientes', 'Cotizados', 'Seguimiento', 'Cerrados', 'Perdidos')),
  last_activity_at timestamptz not null default now(),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;

create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_last_activity_idx on public.leads (last_activity_at desc);
