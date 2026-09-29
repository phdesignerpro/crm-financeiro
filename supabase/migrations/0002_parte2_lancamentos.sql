-- PARTE 2 de 3 — lançamentos, investimentos, metas, patrimônio e configurações (rode DEPOIS da parte 1)
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

