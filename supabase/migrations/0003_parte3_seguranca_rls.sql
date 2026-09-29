-- PARTE 3 de 3 — Row Level Security e proteções (rode DEPOIS das partes 1 e 2)
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
