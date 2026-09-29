import type {
  AppData, Cents, Frequency, ISODate, ProfessionalIncome, RecurringTransaction, Subscription, Transaction,
} from "@/types";
import { addDays, addMonths, addMonthsKey, dayOf, monthOf } from "@/utils/date";
import { uid } from "@/utils/id";

interface Schedulable {
  frequency: Frequency;
  startDate: ISODate;
  endDate: ISODate | null;
  active: boolean;
  generatedThrough: ISODate | null;
}

const STEP_MONTHS: Record<Exclude<Frequency, "weekly">, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Datas de cobrança de uma regra, ancoradas em startDate, dentro de [from, to]. */
export function occurrences(rule: Schedulable, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const limit = rule.endDate && rule.endDate < to ? rule.endDate : to;
  for (let n = 0; n < 5000; n++) {
    const d =
      rule.frequency === "weekly"
        ? addDays(rule.startDate, 7 * n)
        : addMonths(rule.startDate, STEP_MONTHS[rule.frequency] * n);
    if (d > limit) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Última ocorrência <= date (para inicializar generatedThrough sem backfill). */
export function lastOccurrenceOnOrBefore(rule: Schedulable, date: ISODate): ISODate | null {
  const occ = occurrences(rule, rule.startDate, date);
  return occ.length ? occ[occ.length - 1] : null;
}

export function monthlyEquivalent(amount: Cents, f: Frequency): Cents {
  switch (f) {
    case "weekly": return Math.round((amount * 52) / 12);
    case "monthly": return amount;
    case "quarterly": return Math.round(amount / 3);
    case "yearly": return Math.round(amount / 12);
  }
}

export function annualEquivalent(amount: Cents, f: Frequency): Cents {
  switch (f) {
    case "weekly": return amount * 52;
    case "monthly": return amount * 12;
    case "quarterly": return amount * 4;
    case "yearly": return amount;
  }
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Semanal", monthly: "Mensal", quarterly: "Trimestral", yearly: "Anual",
};

const baseTx = (): Omit<Transaction, "id" | "kind" | "description" | "amount" | "date" | "status" | "accountId" | "cardId" | "scope"> => ({
  categoryId: null, subcategoryId: null, toAccountId: null, paymentMethod: "outro", nature: "fixed", tags: [], notes: "",
  recurringId: null, subscriptionId: null, installmentId: null, installmentNumber: null, installmentCount: null,
  invoiceKey: null, investmentId: null, clientId: null, chargeId: null, createdAt: new Date().toISOString(),
});

export function txFromRecurring(r: RecurringTransaction, date: ISODate, virtual: boolean): Transaction {
  return {
    ...baseTx(),
    id: virtual ? `v:${r.id}:${date}` : uid(),
    kind: r.kind, description: r.description, amount: r.amount, date,
    status: virtual ? "pending" : "paid",
    categoryId: r.categoryId, accountId: r.accountId, cardId: r.cardId, scope: r.scope, nature: r.nature, tags: r.tags,
    paymentMethod: r.cardId ? "credito" : "pix", recurringId: r.id, virtual,
  };
}

export function txFromSubscription(s: Subscription, date: ISODate, virtual: boolean): Transaction {
  return {
    ...baseTx(),
    id: virtual ? `v:${s.id}:${date}` : uid(),
    kind: "expense", description: s.name, amount: s.amount, date,
    status: virtual ? "pending" : "paid",
    categoryId: s.categoryId, accountId: s.accountId, cardId: s.cardId, scope: s.scope, nature: "fixed",
    paymentMethod: s.cardId ? "credito" : "debito", subscriptionId: s.id, virtual,
  };
}

/** Ocorrências futuras (ainda não geradas) de recorrências e assinaturas, como lançamentos virtuais. */
export function virtualTransactions(data: AppData, to: ISODate): Transaction[] {
  const out: Transaction[] = [];
  for (const r of data.recurring) {
    if (!r.active) continue;
    const from = r.generatedThrough ? addDays(r.generatedThrough, 1) : r.startDate;
    for (const d of occurrences(r, from, to)) out.push(txFromRecurring(r, d, true));
  }
  for (const s of data.subscriptions) {
    if (!s.active) continue;
    const from = s.generatedThrough ? addDays(s.generatedThrough, 1) : s.startDate;
    for (const d of occurrences(s, from, to)) out.push(txFromSubscription(s, d, true));
  }
  return out;
}

export function allTransactions(data: AppData, to: ISODate): Transaction[] {
  return [...data.transactions, ...virtualTransactions(data, to)];
}

function dueDateFor(month: string, dueDay: number): ISODate {
  return addMonths(`${month}-01`, 0, dueDay);
}

/** Cobranças de clientes recorrentes ainda inexistentes (projeção). */
export function virtualCharges(data: AppData, fromMonth: string, toMonth: string): ProfessionalIncome[] {
  const out: ProfessionalIncome[] = [];
  for (const c of data.clients) {
    if (c.status !== "ativo" || c.monthlyValue <= 0) continue;
    for (let m = fromMonth; m <= toMonth; m = addMonthsKey(m, 1)) {
      if (data.professionalIncome.some((p) => p.clientId === c.id && p.competence === m && p.type === "recorrente")) continue;
      if (`${m}-01` < monthOf(c.startDate) + "-01") continue;
      out.push({
        id: `v:${c.id}:${m}`, clientId: c.id, description: `Mensalidade — ${c.name}`, amount: c.monthlyValue,
        dueDate: dueDateFor(m, c.dueDay), receivedDate: null, status: "pending", type: "recorrente", competence: m, accountId: null,
      });
    }
  }
  return out;
}

export interface Materialization {
  newTransactions: Transaction[];
  recurringUpdates: { id: string; generatedThrough: ISODate }[];
  subscriptionUpdates: { id: string; generatedThrough: ISODate }[];
  newCharges: ProfessionalIncome[];
  settleCardTxIds: string[];
}

/**
 * Gera lançamentos reais das recorrências/assinaturas vencidas até hoje, cobranças mensais
 * dos clientes do mês corrente e baixa automaticamente lançamentos de cartão já ocorridos.
 */
export function computeMaterialization(data: AppData, today: ISODate): Materialization {
  const res: Materialization = { newTransactions: [], recurringUpdates: [], subscriptionUpdates: [], newCharges: [], settleCardTxIds: [] };
  const cap = 60;
  for (const r of data.recurring) {
    if (!r.active) continue;
    const from = r.generatedThrough ? addDays(r.generatedThrough, 1) : r.startDate;
    const occ = occurrences(r, from, today).slice(-cap);
    if (!occ.length) continue;
    for (const d of occ) res.newTransactions.push(txFromRecurring(r, d, false));
    res.recurringUpdates.push({ id: r.id, generatedThrough: occ[occ.length - 1] });
  }
  for (const s of data.subscriptions) {
    if (!s.active) continue;
    const from = s.generatedThrough ? addDays(s.generatedThrough, 1) : s.startDate;
    const occ = occurrences(s, from, today).slice(-cap);
    if (!occ.length) continue;
    for (const d of occ) res.newTransactions.push(txFromSubscription(s, d, false));
    res.subscriptionUpdates.push({ id: s.id, generatedThrough: occ[occ.length - 1] });
  }
  const m = monthOf(today);
  for (const c of virtualCharges(data, m, m)) {
    res.newCharges.push({ ...c, id: uid() });
  }
  for (const t of data.transactions) {
    if (t.status === "pending" && t.cardId && t.kind === "expense" && t.date <= today) res.settleCardTxIds.push(t.id);
  }
  return res;
}

export { dayOf };
