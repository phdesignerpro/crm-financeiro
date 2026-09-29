import type { AppData, Cents, ID, ISODate, MonthKey, Transaction } from "@/types";
import {
  addDays, addMonths, addMonthsKey, daysInMonth, diffDays, lastMonths, monthEnd, monthOf, monthStart,
} from "@/utils/date";
import { sum } from "@/utils/money";
import { cardInvoices, cashBalance } from "./finance";
import { virtualCharges, virtualTransactions } from "./schedule";

export type EventType =
  | "bill" | "subscription" | "installment" | "invoice" | "income" | "professional"
  | "investment" | "reserve" | "goal" | "tax" | "variable";

export interface CashEvent {
  id: string;
  date: ISODate;
  amount: Cents; // sempre positivo
  direction: "in" | "out";
  type: EventType;
  label: string;
  virtual?: boolean;
  overdue?: boolean;
  refId?: ID;
  cardId?: ID | null;
}

/** Eventos de caixa agendados (contas, assinaturas, parcelas, faturas, recebimentos) até `end`. */
export function scheduledEvents(d: AppData, today: ISODate, end: ISODate): CashEvent[] {
  const out: CashEvent[] = [];
  const virt = virtualTransactions(d, end);
  const clamp = (x: ISODate) => (x < today ? today : x);

  const push = (t: Transaction) => {
    const type: EventType = t.kind === "income" ? "income" : t.installmentId ? "installment" : t.subscriptionId ? "subscription" : "bill";
    out.push({
      id: t.id, date: clamp(t.date), amount: t.amount, direction: t.kind === "income" ? "in" : "out", type,
      label: t.installmentNumber ? `${t.description} (${t.installmentNumber}/${t.installmentCount})` : t.description,
      virtual: t.virtual, overdue: t.date < today, refId: t.id,
    });
  };
  for (const t of d.transactions) {
    if (t.status === "pending" && !t.cardId && t.date <= end && (t.kind === "expense" || t.kind === "income")) push(t);
  }
  for (const v of virt) {
    if (v.cardId || v.date > end) continue;
    push(v);
  }

  for (const card of d.creditCards) {
    const txs = [...d.transactions, ...virt].filter((t) => t.cardId === card.id);
    for (const inv of cardInvoices(card, txs, today)) {
      if (inv.remaining <= 0 || inv.dueDate > end) continue;
      out.push({
        id: `inv:${card.id}:${inv.key}`, date: clamp(inv.dueDate), amount: inv.remaining, direction: "out", type: "invoice",
        label: `Fatura ${card.name}`, overdue: inv.dueDate < today, refId: card.id, cardId: card.id,
      });
    }
  }

  for (const p of d.professionalIncome) {
    if (p.status === "pending" && p.dueDate >= today && p.dueDate <= end) {
      out.push({ id: `ch:${p.id}`, date: p.dueDate, amount: p.amount, direction: "in", type: "professional", label: p.description, refId: p.id });
    }
  }
  for (const c of virtualCharges(d, monthOf(today), monthOf(end))) {
    if (c.dueDate >= today && c.dueDate <= end) {
      out.push({ id: c.id, date: c.dueDate, amount: c.amount, direction: "in", type: "professional", label: c.description, virtual: true });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Média mensal de gastos variáveis "livres" (sem recorrências/parcelas) dos 3 últimos meses fechados. */
export function variableBaseline(d: AppData, today: ISODate): Cents {
  const cur = monthOf(today);
  const months = lastMonths(addMonthsKey(cur, -1), 3);
  const total = sum(
    d.transactions
      .filter((t) => t.kind === "expense" && t.status === "paid" && t.nature === "variable" && !t.recurringId && !t.subscriptionId && !t.installmentId && months.includes(monthOf(t.date)))
      .map((t) => t.amount),
  );
  return Math.round(total / months.length);
}

export function variableSpentSoFar(d: AppData, today: ISODate): Cents {
  const cur = monthOf(today);
  return sum(
    d.transactions
      .filter((t) => t.kind === "expense" && t.status === "paid" && t.nature === "variable" && !t.recurringId && !t.subscriptionId && !t.installmentId && monthOf(t.date) === cur)
      .map((t) => t.amount),
  );
}

export function investedThisMonth(d: AppData, today: ISODate): Cents {
  const cur = monthOf(today);
  return sum(d.investmentTransactions.filter((i) => i.type === "aporte" && monthOf(i.date) === cur).map((i) => i.amount));
}

export function reserveContributedThisMonth(d: AppData, today: ISODate): Cents {
  const cur = monthOf(today);
  return sum(d.emergencyEntries.filter((e) => e.amount > 0 && monthOf(e.date) === cur).map((e) => e.amount));
}

/** Imposto ainda a reservar sobre a receita profissional do mês. */
export function taxToReserve(d: AppData, today: ISODate): Cents {
  const cur = monthOf(today);
  const catImpostos = d.categories.find((c) => c.name === "Impostos")?.id;
  const income = sum(d.transactions.filter((t) => t.kind === "income" && t.scope === "professional" && t.status === "paid" && monthOf(t.date) === cur).map((t) => t.amount));
  const paid = sum(d.transactions.filter((t) => t.kind === "expense" && t.scope === "professional" && t.categoryId === catImpostos && monthOf(t.date) === cur && t.status === "paid").map((t) => t.amount));
  return Math.max(0, Math.round((income * d.settings.taxRatePct) / 100) - paid);
}

/** Aportes planejados (investimento, reserva, metas) a partir de hoje. */
export function plannedEvents(d: AppData, today: ISODate, end: ISODate, opts: { includeGoals?: boolean } = {}): CashEvent[] {
  const out: CashEvent[] = [];
  const goalsMonthly = sum(d.goals.filter((g) => g.current < g.target).map((g) => g.monthly));
  const startM = monthOf(today);
  for (let m: MonthKey = startM; m <= monthOf(end); m = addMonthsKey(m, 1)) {
    const isCur = m === startM;
    const day10 = addMonths(`${m}-01`, 0, 10);
    const date = isCur && day10 <= today ? today : day10;
    if (date > end || date < today) continue;
    const inv = isCur ? Math.max(0, d.settings.monthlyInvestmentPlan - investedThisMonth(d, today)) : d.settings.monthlyInvestmentPlan;
    const res = isCur ? Math.max(0, d.emergencyFund.monthlyContribution - reserveContributedThisMonth(d, today)) : d.emergencyFund.monthlyContribution;
    if (inv > 0) out.push({ id: `pi:${m}`, date, amount: inv, direction: "out", type: "investment", label: "Aporte planejado em investimentos", virtual: true });
    if (res > 0) out.push({ id: `pr:${m}`, date, amount: res, direction: "out", type: "reserve", label: "Aporte na reserva de emergência", virtual: true });
    // metas do mês corrente: não há registro de aportes já feitos, então só projetamos a partir do próximo mês
    if (opts.includeGoals && goalsMonthly > 0 && !isCur) out.push({ id: `pg:${m}`, date, amount: goalsMonthly, direction: "out", type: "goal", label: "Aportes planejados em metas", virtual: true });
  }
  return out;
}

/* ───────────── Disponível de verdade ───────────── */

export interface AvailableBreakdown {
  balance: Cents;
  bills: Cents;
  scheduled: Cents;
  cards: Cents;
  installments: Cents;
  investments: Cents;
  reserve: Cents;
  taxes: Cents;
  totalCommitted: Cents;
  available: Cents;
  horizonDays: number;
  end: ISODate;
}

export function availableForReal(d: AppData, today: ISODate): AvailableBreakdown {
  const end = addDays(today, d.settings.horizonDays);
  const ev = scheduledEvents(d, today, end).filter((e) => e.direction === "out");
  const bills = sum(ev.filter((e) => e.type === "bill" && !e.virtual).map((e) => e.amount));
  const scheduled = sum(ev.filter((e) => (e.type === "bill" && e.virtual) || e.type === "subscription").map((e) => e.amount));
  const cards = sum(ev.filter((e) => e.type === "invoice").map((e) => e.amount));
  const installments = sum(ev.filter((e) => e.type === "installment").map((e) => e.amount));
  const planned = plannedEvents(d, today, end);
  const investments = sum(planned.filter((e) => e.type === "investment").map((e) => e.amount));
  const reserve = sum(planned.filter((e) => e.type === "reserve").map((e) => e.amount));
  const taxes = taxToReserve(d, today);
  const balance = cashBalance(d);
  const totalCommitted = bills + scheduled + cards + installments + investments + reserve + taxes;
  return { balance, bills, scheduled, cards, installments, investments, reserve, taxes, totalCommitted, available: balance - totalCommitted, horizonDays: d.settings.horizonDays, end };
}

/* ───────────── Fluxo de caixa projetado ───────────── */

export interface ProjectionOptions {
  extraIncomeMonthly?: Cents;
  cutExpensesMonthly?: Cents;
  extraInvestMonthly?: Cents;
  oneOffs?: { amount: Cents; date: ISODate; label: string }[];
  /** Parcelas mensais extras a partir do mês seguinte (ex.: financiamento). */
  financing?: { monthly: Cents; months: number; label: string };
  includeGoals?: boolean;
}

export interface MonthlyRow {
  month: MonthKey;
  income: Cents;
  bills: Cents;
  invoices: Cents;
  variable: Cents;
  invest: Cents;
  reserve: Cents;
  goals: Cents;
  extra: Cents;
  net: Cents;
  closing: Cents;
}

export interface Projection {
  start: Cents;
  end: ISODate;
  events: CashEvent[];
  daily: { date: ISODate; balance: Cents }[];
  monthly: MonthlyRow[];
  endBalance: Cents;
  minBalance: Cents;
  minDate: ISODate;
  avgMonthlyNet: Cents;
}

export function projectCashflow(d: AppData, today: ISODate, days: number, opts: ProjectionOptions = {}): Projection {
  const end = addDays(today, days);
  const events: CashEvent[] = [...scheduledEvents(d, today, end), ...plannedEvents(d, today, end, { includeGoals: opts.includeGoals ?? true })];

  // gastos variáveis estimados, distribuídos por dia
  const base = Math.max(0, variableBaseline(d, today) - (opts.cutExpensesMonthly ?? 0));
  const spent = variableSpentSoFar(d, today);
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    const [y, m] = date.split("-").map(Number);
    const dim = daysInMonth(y, m);
    let perDay: number;
    if (monthOf(date) === monthOf(today)) {
      const remainingDays = Math.max(1, dim - Number(today.slice(8, 10)));
      perDay = Math.max(0, base - spent) / remainingDays;
    } else perDay = base / dim;
    if (perDay > 0) events.push({ id: `var:${date}`, date, amount: Math.round(perDay), direction: "out", type: "variable", label: "Gastos variáveis estimados", virtual: true });
  }

  const startM = monthOf(today);
  for (let m = startM; m <= monthOf(end); m = addMonthsKey(m, 1)) {
    if (opts.extraIncomeMonthly) {
      const date = addMonths(`${m}-01`, 0, 5);
      if (date >= today && date <= end) events.push({ id: `xi:${m}`, date, amount: opts.extraIncomeMonthly, direction: "in", type: "income", label: "Renda adicional (simulação)", virtual: true });
    }
    if (opts.extraInvestMonthly) {
      const date = addMonths(`${m}-01`, 0, 10);
      if (date >= today && date <= end) events.push({ id: `xv:${m}`, date, amount: opts.extraInvestMonthly, direction: "out", type: "investment", label: "Investimento adicional (simulação)", virtual: true });
    }
  }
  if (opts.financing) {
    for (let k = 1; k <= opts.financing.months; k++) {
      const date = addMonths(today, k);
      if (date <= end) events.push({ id: `fin:${k}`, date, amount: opts.financing.monthly, direction: "out", type: "bill", label: opts.financing.label, virtual: true });
    }
  }
  for (const [i, o] of (opts.oneOffs ?? []).entries()) {
    if (o.date <= end) events.push({ id: `oo:${i}`, date: o.date < today ? today : o.date, amount: o.amount, direction: "out", type: "bill", label: o.label, virtual: true });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  const start = cashBalance(d);
  const byDate = new Map<ISODate, number>();
  for (const e of events) byDate.set(e.date, (byDate.get(e.date) ?? 0) + (e.direction === "in" ? e.amount : -e.amount));
  const daily: Projection["daily"] = [];
  let bal = start;
  let minBalance = start;
  let minDate = today;
  daily.push({ date: today, balance: bal });
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    bal += byDate.get(date) ?? 0;
    if (i > 0) daily.push({ date, balance: bal });
    if (bal < minBalance) { minBalance = bal; minDate = date; }
  }
  // (o dia de hoje já inclui eventos vencidos; recalcular ponto inicial)
  daily[0] = { date: today, balance: start + (byDate.get(today) ?? 0) };

  const monthly: MonthlyRow[] = [];
  let closing = start;
  for (let m = startM; m <= monthOf(end); m = addMonthsKey(m, 1)) {
    const row: MonthlyRow = { month: m, income: 0, bills: 0, invoices: 0, variable: 0, invest: 0, reserve: 0, goals: 0, extra: 0, net: 0, closing: 0 };
    for (const e of events) {
      if (monthOf(e.date) !== m) continue;
      if (e.direction === "in") row.income += e.amount;
      else if (e.type === "invoice") row.invoices += e.amount;
      else if (e.type === "variable") row.variable += e.amount;
      else if (e.type === "investment") row.invest += e.amount;
      else if (e.type === "reserve") row.reserve += e.amount;
      else if (e.type === "goal") row.goals += e.amount;
      else row.bills += e.amount;
    }
    row.net = row.income - row.bills - row.invoices - row.variable - row.invest - row.reserve - row.goals;
    closing += row.net;
    row.closing = closing;
    monthly.push(row);
  }
  const endBalance = daily[daily.length - 1].balance;
  return {
    start, end, events, daily, monthly, endBalance, minBalance, minDate,
    avgMonthlyNet: monthly.length ? Math.round(sum(monthly.map((r) => r.net)) / Math.max(1, days / 30)) : 0,
  };
}

/* ───────────── Próximos compromissos ───────────── */

export function upcomingCommitments(d: AppData, today: ISODate, days: number): CashEvent[] {
  const end = addDays(today, days);
  return scheduledEvents(d, today, end).filter((e) => e.direction === "out");
}

export { diffDays, monthEnd, monthStart };
