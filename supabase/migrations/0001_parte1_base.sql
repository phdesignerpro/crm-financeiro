-- PARTE 1 de 3 — usuários, contas, categorias, cartões, assinaturas, clientes (rode PRIMEIRO)
-- Meu Caixa — schema inicial (PostgreSQL / Supabase)
-- Valores monetários: numeric(14,2) (nunca float). Datas: date. IDs: uuid.
-- Segurança: RLS em TODAS as tabelas; cada linha pertence a auth.uid().

create extension if not exists "pgcrypto";

-- ───────── users (perfil ligado ao Supabase Auth) ─────────
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── contas ─────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  institution text not null,
  name text not null,
  type text not null check (type in ('corrente','digital','carteira','dinheiro','empresarial','investimentos')),
  initial_balance numeric(14,2) not null default 0,
  color text not null default '#6366f1',
  icon text not null default 'wallet',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  parent_id uuid references public.categories (id) on delete cascade,
  kind text not null check (kind in ('expense','income')),
  color text not null default '#94a3b8',
  nature text not null default 'variable' check (nature in ('fixed','variable','eventual')),
  essential boolean not null default false
);

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  bank text not null,
  name text not null,
  credit_limit numeric(14,2) not null check (credit_limit >= 0),
  closing_day int not null check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  account_id uuid references public.accounts (id) on delete set null,
  color text not null default '#6366f1'
);

create table public.installments (           -- plano de compra parcelada
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  description text not null,
  total numeric(14,2) not null check (total > 0),
  count int not null check (count between 1 and 120),
  start_date date not null,
  card_id uuid references public.credit_cards (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  scope text not null default 'personal' check (scope in ('personal','professional')),
  status text not null default 'active' check (status in ('active','cancelled','completed')),
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null check (amount >= 0),
  previous_amount numeric(14,2),
  frequency text not null check (frequency in ('weekly','monthly','quarterly','yearly')),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  generated_through date,
  card_id uuid references public.credit_cards (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  scope text not null default 'personal' check (scope in ('personal','professional')),
  usage_level text check (usage_level in ('alto','medio','baixo'))
);

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  frequency text not null check (frequency in ('weekly','monthly','quarterly','yearly')),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  generated_through date,
  category_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  card_id uuid references public.credit_cards (id) on delete set null,
  scope text not null default 'personal' check (scope in ('personal','professional')),
  nature text not null default 'fixed' check (nature in ('fixed','variable','eventual')),
  tags text[] not null default '{}'
);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  institution text not null,
  category text not null check (category in ('reserva','cdb','tesouro','renda_fixa','acoes','fiis','etfs','cripto','previdencia','outros')),
  objective text not null default '',
  liquidity text not null check (liquidity in ('diaria','d1','d30','vencimento','baixa')),
  maturity date,
  rate_label text not null default '',
  applied_amount numeric(14,2) not null default 0,
  current_value numeric(14,2) not null default 0,
  contribution_date date not null,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  service text not null default '',
  monthly_value numeric(14,2) not null default 0,
  monthly_cost numeric(14,2) not null default 0,
  due_day int not null check (due_day between 1 and 31),
  status text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  start_date date not null,
  notes text not null default ''
);

create table public.professional_income (     -- cobranças / recebíveis de clientes
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  received_date date,
  status text not null default 'pending' check (status in ('pending','received')),
  type text not null check (type in ('recorrente','avulso')),
  competence text,
  account_id uuid references public.accounts (id) on delete set null
);

