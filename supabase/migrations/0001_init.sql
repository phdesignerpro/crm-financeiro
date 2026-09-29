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

-- ───────── lançamentos ─────────
-- kind: income | expense | transfer | invoice_payment | investment
-- Compras no cartão = expense com card_id. Pagamento de fatura = invoice_payment (não é despesa).
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  kind text not null check (kind in ('income','expense','transfer','invoice_payment','investment')),
  description text not null,
  amount numeric(14,2) not null,
  date date not null,
  status text not null default 'paid' check (status in ('paid','pending')),
  category_id uuid references public.categories (id) on delete set null,
  subcategory_id uuid references public.categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  to_account_id uuid references public.accounts (id) on delete set null,
  card_id uuid references public.credit_cards (id) on delete set null,
  payment_method text not null default 'outro',
  nature text not null default 'variable' check (nature in ('fixed','variable','eventual')),
  scope text not null default 'personal' check (scope in ('personal','professional')),
  tags text[] not null default '{}',
  notes text not null default '',
  recurring_id uuid references public.recurring_transactions (id) on delete set null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  installment_id uuid references public.installments (id) on delete set null,
  installment_number int,
  installment_count int,
  invoice_key text,
  investment_id uuid references public.investments (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  charge_id uuid references public.professional_income (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'investment' or amount >= 0)
);
create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_card_idx on public.transactions (card_id) where card_id is not null;

-- Visões de conveniência (respeitam RLS via security_invoker)
create view public.credit_card_transactions with (security_invoker = true) as
  select * from public.transactions where card_id is not null;
create view public.professional_expenses with (security_invoker = true) as
  select * from public.transactions where scope = 'professional' and kind = 'expense';

create table public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  investment_id uuid not null references public.investments (id) on delete cascade,
  date date not null,
  type text not null check (type in ('aporte','resgate','rendimento')),
  amount numeric(14,2) not null check (amount >= 0),
  account_id uuid references public.accounts (id) on delete set null
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  unique (user_id, category_id)
);

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  category text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0,
  deadline date not null,
  monthly_amount numeric(14,2) not null default 0,
  priority text not null check (priority in ('alta','media','baixa')),
  created_at timestamptz not null default now()
);

create table public.emergency_fund (          -- 1 linha por usuário
  user_id uuid primary key default auth.uid() references public.users (id) on delete cascade,
  essential_monthly numeric(14,2) not null default 0,
  target_months int not null default 6 check (target_months in (3,6,9,12)),
  monthly_contribution numeric(14,2) not null default 0,
  location text not null default ''
);

create table public.emergency_fund_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  date date not null,
  amount numeric(14,2) not null,
  note text not null default ''
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('imovel','veiculo','outro','a_receber')),
  value numeric(14,2) not null default 0
);

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('financiamento','emprestimo','divida','a_pagar')),
  balance numeric(14,2) not null default 0,
  monthly_payment numeric(14,2) not null default 0
);

create table public.patrimony_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  assets numeric(14,2) not null,
  liabilities numeric(14,2) not null,
  unique (user_id, month)
);

create table public.notifications (           -- estado de leitura dos alertas gerados pelas regras
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  id text not null,
  read_at timestamptz,
  primary key (user_id, id)
);

create table public.financial_insights (      -- reservado para insights persistidos / futura IA
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key default auth.uid() references public.users (id) on delete cascade,
  user_name text not null default '',
  theme text not null default 'system',
  monthly_investment_plan numeric(14,2) not null default 0,
  tax_rate_pct numeric(5,2) not null default 6,
  horizon_days int not null default 30 check (horizon_days between 7 and 90),
  hidden_cards text[] not null default '{}',
  card_order text[] not null default '{}'
);

-- ───────── Row Level Security ─────────
alter table public.users enable row level security;
create policy users_self on public.users for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','categories','credit_cards','installments','subscriptions','recurring_transactions','investments','clients',
    'professional_income','transactions','investment_transactions','budgets','financial_goals','emergency_fund',
    'emergency_fund_entries','assets','liabilities','patrimony_snapshots','notifications','financial_insights','user_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_owner', t);
  end loop;
end $$;

-- Impede que um usuário aponte FKs para linhas de outro usuário (defesa em profundidade).
create or replace function public.assert_same_owner() returns trigger
language plpgsql as $$
declare ref uuid; owner uuid; col text; tbl text;
begin
  for col, tbl in select * from (values
    ('account_id','accounts'),('to_account_id','accounts'),('card_id','credit_cards'),('category_id','categories'),
    ('subcategory_id','categories'),('client_id','clients'),('investment_id','investments'),('installment_id','installments')) v(c, t)
  loop
    begin
      execute format('select ($1).%I', col) into ref using new;
    exception when undefined_column then continue; end;
    if ref is not null then
      execute format('select user_id from public.%I where id = $1', tbl) into owner using ref;
      if owner is distinct from new.user_id then
        raise exception 'Referência inválida em %', col using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger transactions_same_owner before insert or update on public.transactions
  for each row execute function public.assert_same_owner();
