import type {
  Account, AppData, Category, Cents, CreditCard, ID, ISODate, MonthKey, Scope, Transaction,
} from "@/types";
import { addDays, addMonths, addMonthsKey, dayOf, diffDays, monthEnd, monthOf, monthStart } from "@/utils/date";
import { sum } from "@/utils/money";

/* ───────────── Contas ───────────── */

/** Efeito de um lançamento no saldo de uma conta (somente lançamentos efetivados). */
export function accountDelta(t: Transaction, accountId: ID): Cents {
  if (t.status !== "paid" || t.virtual) return 0;
  switch (t.kind) {
    case "income":
      return t.accountId === accountId ? t.amount : 0;
    case "expense":
      // Compras no cartão NÃO mexem na conta: só o pagamento da fatura mexe.
      return t.accountId === accountId && !t.cardId ? -t.amount : 0;
    case "transfer":
      return (t.accountId === accountId ? -t.amount : 0) + (t.toAccountId === accountId ? t.amount : 0);
    case "invoice_payment":
    case "investment":
      return t.accountId === accountId ? -t.amount : 0;
  }
}

export function accountBalance(acc: Account, txs: Transaction[], asOf?: ISODate): Cents {
  let b = acc.initialBalance;
  for (const t of txs) {
    if (asOf && t.date > asOf) continue;
    b += accountDelta(t, acc.id);
  }
  return b;
}

export const activeAccounts = (d: AppData) => d.accounts.filter((a) => !a.archived);

/** Saldo disponível = contas que não são de investimento. */
export function cashBalance(d: AppData): Cents {
  return sum(activeAccounts(d).filter((a) => a.type !== "investimentos").map((a) => accountBalance(a, d.transactions)));
}

export function totalAccountsBalance(d: AppData): Cents {
  return sum(activeAccounts(d).map((a) => accountBalance(a, d.transactions)));
}

/* ───────────── Cartões e faturas ───────────── */

export function invoiceKeyFor(card: CreditCard, date: ISODate): MonthKey {
  const m = monthOf(date);
  return dayOf(date) > card.closingDay ? addMonthsKey(m, 1) : m;
}

export const invoiceClosingDate = (card: CreditCard, key: MonthKey): ISODate => addMonths(`${key}-01`, 0, card.closingDay);

export function invoiceDueDate(card: CreditCard, key: MonthKey): ISODate {
  const month = card.dueDay > card.closingDay ? key : addMonthsKey(key, 1);
  return addMonths(`${month}-01`, 0, card.dueDay);
}

export type InvoiceStatus = "aberta" | "fechada" | "paga" | "atrasada";

export interface Invoice {
  key: MonthKey;
  cardId: ID;
  total: Cents;
  paid: Cents;
  remaining: Cents;
  closingDate: ISODate;
  dueDate: ISODate;
  status: InvoiceStatus;
  items: Transaction[];
}

/** Todas as faturas de um cartão (com base nos lançamentos informados). */
export function cardInvoices(card: CreditCard, txs: Transaction[], today: ISODate): Invoice[] {
  const map = new Map<MonthKey, Invoice>();
  const get = (key: MonthKey): Invoice => {
    let inv = map.get(key);
    if (!inv) {
      inv = {
        key, cardId: card.id, total: 0, paid: 0, remaining: 0, items: [],
        closingDate: invoiceClosingDate(card, key), dueDate: invoiceDueDate(card, key), status: "aberta",
      };
      map.set(key, inv);
    }
    return inv;
  };
  for (const t of txs) {
    if (t.cardId !== card.id) continue;
    if (t.kind === "expense") {
      const inv = get(invoiceKeyFor(card, t.date));
      inv.total += t.amount;
      inv.items.push(t);
    } else if (t.kind === "invoice_payment" && t.invoiceKey && t.status === "paid") {
      get(t.invoiceKey).paid += t.amount;
    }
  }
  for (const inv of map.values()) {
    inv.remaining = Math.max(0, inv.total - inv.paid);
    if (inv.total > 0 && inv.remaining === 0) inv.status = "paga";
    else if (inv.closingDate < today) inv.status = inv.dueDate < today ? "atrasada" : "fechada";
    else inv.status = "aberta";
    inv.items.sort((a, b) => b.date.localeCompare(a.date));
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Fatura em aberto atual (a que ainda recebe compras) e a próxima. */
export function currentInvoiceKey(card: CreditCard, today: ISODate): MonthKey {
  return invoiceKeyFor(card, today);
}

export interface CardSummary {
  card: CreditCard;
  used: Cents;
  available: Cents;
  usedPct: number;
  invoices: Invoice[];
  current: Invoice;
  next: Invoice;
  /** Faturas não quitadas com valor, em ordem. */
  unpaid: Invoice[];
  futureInstallments: Cents;
}

export function cardSummary(d: AppData, card: CreditCard, today: ISODate, txs: Transaction[] = d.transactions): CardSummary {
  const invoices = cardInvoices(card, txs, today);
  const emptyInv = (key: MonthKey): Invoice => ({
    key, cardId: card.id, total: 0, paid: 0, remaining: 0, items: [], status: "aberta",
    closingDate: invoiceClosingDate(card, key), dueDate: invoiceDueDate(card, key),
  });
  const ck = currentInvoiceKey(card, today);
  const current = invoices.find((i) => i.key === ck) ?? emptyInv(ck);
  const nk = addMonthsKey(ck, 1);
  const next = invoices.find((i) => i.key === nk) ?? emptyInv(nk);
  const unpaid = invoices.filter((i) => i.remaining > 0);
  const used = sum(unpaid.map((i) => i.remaining));
  const futureInstallments = sum(
    txs.filter((t) => t.cardId === card.id && t.kind === "expense" && t.installmentId && t.date > today).map((t) => t.amount),
  );
  return {
    card, used, available: Math.max(0, card.limit - used), usedPct: card.limit ? (used / card.limit) * 100 : 0,
    invoices, current, next, unpaid, futureInstallments,
  };
}

export const allCardSummaries = (d: AppData, today: ISODate, txs?: Transaction[]) =>
  d.creditCards.map((c) => cardSummary(d, c, today, txs));

/** Faturas em aberto (a pagar) de todos os cartões. */
export function openInvoicesTotal(d: AppData, today: ISODate): Cents {
  return sum(allCardSummaries(d, today).map((s) => s.used));
}

/* ───────────── Resumos mensais ───────────── */

const inScope = (t: Transaction, scope?: Scope | "all") => !scope || scope === "all" || t.scope === scope;

export interface MonthSummary {
  income: Cents;
  expense: Cents;
  result: Cents;
  savingsRate: number;
  invested: Cents;
}

export function monthSummary(d: AppData, month: MonthKey, scope?: Scope | "all", upToDay?: number): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const t of d.transactions) {
    if (t.status !== "paid" || monthOf(t.date) !== month || !inScope(t, scope)) continue;
    if (upToDay && dayOf(t.date) > upToDay) continue;
    if (t.kind === "income") income += t.amount;
    else if (t.kind === "expense") expense += t.amount;
  }
  const invested = sum(
    d.investmentTransactions
      .filter((i) => i.type === "aporte" && monthOf(i.date) === month && (!upToDay || dayOf(i.date) <= upToDay))
      .map((i) => i.amount),
  );
  const result = income - expense;
  return { income, expense, result, savingsRate: income > 0 ? (result / income) * 100 : 0, invested };
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Categoria "raiz" (agrupa subcategorias no pai). */
export function rootCategory(cats: Category[], id: ID | null): Category | null {
  const c = cats.find((x) => x.id === id);
  if (!c) return null;
  return c.parentId ? cats.find((x) => x.id === c.parentId) ?? c : c;
}

export interface CategorySpend {
  categoryId: ID | null;
  name: string;
  color: string;
  total: Cents;
}

export function spendingByCategory(d: AppData, from: ISODate, to: ISODate, scope?: Scope | "all"): CategorySpend[] {
  const map = new Map<string, CategorySpend>();
  for (const t of d.transactions) {
    if (t.kind !== "expense" || t.status !== "paid" || t.date < from || t.date > to || !inScope(t, scope)) continue;
    const cat = rootCategory(d.categories, t.categoryId);
    const key = cat?.id ?? "none";
    const cur = map.get(key) ?? { categoryId: cat?.id ?? null, name: cat?.name ?? "Sem categoria", color: cat?.color ?? "#94a3b8", total: 0 };
    cur.total += t.amount;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function spendingByNature(d: AppData, month: MonthKey, scope?: Scope | "all") {
  const out = { fixed: 0, variable: 0, eventual: 0 };
  for (const t of d.transactions) {
    if (t.kind !== "expense" || t.status !== "paid" || monthOf(t.date) !== month || !inScope(t, scope)) continue;
    out[t.nature] += t.amount;
  }
  return out;
}

export const rangeOfMonth = (m: MonthKey): [ISODate, ISODate] => [monthStart(m), monthEnd(m)];

/** Últimos N dias (inclui hoje). */
export const lastDaysRange = (today: ISODate, days: number): [ISODate, ISODate] => [addDays(today, -(days - 1)), today];

export function monthlySeries(d: AppData, months: MonthKey[], scope?: Scope | "all") {
  return months.map((m) => ({ month: m, ...monthSummary(d, m, scope) }));
}

/* ───────────── Orçamento ───────────── */

export interface BudgetStatus {
  budgetId: ID;
  category: Category;
  limit: Cents;
  spent: Cents;
  pct: number;
  level: "ok" | "70" | "90" | "100";
}

export function budgetStatuses(d: AppData, month: MonthKey): BudgetStatus[] {
  const [from, to] = rangeOfMonth(month);
  const spend = spendingByCategory(d, from, to, "personal");
  return d.budgets
    .map((b) => {
      const category = d.categories.find((c) => c.id === b.categoryId);
      if (!category) return null;
      const spent = spend.find((s) => s.categoryId === b.categoryId)?.total ?? 0;
      const pct = b.amount ? (spent / b.amount) * 100 : 0;
      const level: BudgetStatus["level"] = pct >= 100 ? "100" : pct >= 90 ? "90" : pct >= 70 ? "70" : "ok";
      return { budgetId: b.id, category, limit: b.amount, spent, pct, level };
    })
    .filter((x): x is BudgetStatus => !!x)
    .sort((a, b) => b.pct - a.pct);
}

export { diffDays };
