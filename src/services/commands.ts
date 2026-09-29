import type {
  AppData, Cents, CreditCard, ID, ISODate, InstallmentPlan, Investment, MonthKey, ProfessionalIncome, Subscription, Transaction,
} from "@/types";
import type { Actions } from "@/hooks/useStore";
import { uid } from "@/utils/id";
import { monthOf } from "@/utils/date";
import { addMonths } from "@/utils/date";
import { splitInstallments } from "@/utils/money";
import { emptyTx, buildEntry, type EntryValues } from "./transactions";
import { lastOccurrenceOnOrBefore } from "./schedule";
import { netWorth } from "./networth";

/* ───────────── Movimentações ───────────── */

export function createEntry(a: Actions, d: AppData, v: EntryValues, today: ISODate) {
  const built = buildEntry(v, today, d.creditCards);
  if (built.plan) a.add("installments", built.plan);
  if (built.rule) a.add("recurring", built.rule);
  a.add("transactions", built.transactions);
  if (v.entry === "investment" && v.investmentId) {
    const inv = d.investments.find((i) => i.id === v.investmentId);
    if (inv) applyInvestmentMove(a, inv, { type: "aporte", amount: v.amount, date: v.date, accountId: v.accountId });
  }
}

/** Edita apenas este lançamento (não recria parcelas/recorrência). */
export function updateEntry(a: Actions, d: AppData, tx: Transaction, v: EntryValues, today: ISODate) {
  const card = d.creditCards.find((c) => c.id === v.cardId);
  const kind: Transaction["kind"] =
    v.entry === "income" ? "income" : v.entry === "transfer" ? "transfer" : v.entry === "investment" ? "investment" : "expense";
  const isCard = v.entry === "card";
  a.patch("transactions", tx.id, {
    kind, description: v.description.trim(), amount: v.amount, date: v.date,
    categoryId: kind === "transfer" ? null : v.categoryId, subcategoryId: kind === "transfer" ? null : v.subcategoryId,
    accountId: isCard ? card?.accountId ?? null : v.accountId, toAccountId: v.entry === "transfer" ? v.toAccountId : null,
    cardId: isCard ? v.cardId : null, paymentMethod: isCard ? "credito" : v.paymentMethod, nature: v.nature, scope: v.scope,
    tags: v.tags, notes: v.notes, investmentId: v.entry === "investment" ? v.investmentId : tx.investmentId,
    status: isCard ? (v.date <= today ? "paid" : "pending") : v.entry === "transfer" || v.entry === "investment" ? "paid" : v.paid ? "paid" : "pending",
  });
}

export function duplicateEntry(a: Actions, tx: Transaction, today: ISODate) {
  const copy: Transaction = {
    ...tx, id: uid(), date: today, createdAt: new Date().toISOString(), recurringId: null, subscriptionId: null,
    installmentId: null, installmentNumber: null, installmentCount: null, invoiceKey: null, chargeId: null,
    status: tx.cardId || tx.kind === "transfer" || tx.kind === "investment" ? "paid" : tx.status,
    description: tx.description,
  };
  delete copy.virtual;
  a.add("transactions", copy);
  return copy;
}

export type DeleteScope = "one" | "future" | "all";

export function deleteEntry(a: Actions, d: AppData, tx: Transaction, scope: DeleteScope = "one") {
  if (tx.installmentId && scope !== "one") {
    const rows = d.transactions.filter((t) => t.installmentId === tx.installmentId && (scope === "all" || t.installmentNumber! >= tx.installmentNumber!));
    a.remove("transactions", rows.map((t) => t.id));
    const remaining = d.transactions.filter((t) => t.installmentId === tx.installmentId && !rows.includes(t));
    if (!remaining.length) a.remove("installments", tx.installmentId);
    return;
  }
  a.remove("transactions", tx.id);
  if (tx.chargeId) a.patch("professionalIncome", tx.chargeId, { status: "pending", receivedDate: null });
  if (tx.investmentId) {
    const inv = d.investments.find((i) => i.id === tx.investmentId);
    const it = d.investmentTransactions.find((x) => x.investmentId === tx.investmentId && x.date === tx.date && x.amount === tx.amount);
    if (inv && it) {
      a.remove("investmentTransactions", it.id);
      a.patch("investments", inv.id, { appliedAmount: Math.max(0, inv.appliedAmount - tx.amount), currentValue: Math.max(0, inv.currentValue - tx.amount) });
    }
  }
}

export function markPaid(a: Actions, tx: Transaction, paid: boolean) {
  a.patch("transactions", tx.id, { status: paid ? "paid" : "pending" });
}

/* ───────────── Cartões ───────────── */

/** Paga fatura: só movimenta dinheiro conta → cartão. Não cria despesa nova (evita dupla contagem). */
export function payInvoice(a: Actions, card: CreditCard, key: MonthKey, amount: Cents, accountId: ID, date: ISODate, scope: "personal" | "professional") {
  a.add("transactions", {
    ...emptyTx(), kind: "invoice_payment", description: `Pagamento fatura ${card.name}`, amount, date, cardId: card.id, accountId,
    invoiceKey: key, paymentMethod: "transferencia", status: "paid", scope,
  });
}

/* ───────────── Parcelas ───────────── */

export function futureInstallments(d: AppData, planId: ID, today: ISODate) {
  return d.transactions.filter((t) => t.installmentId === planId && t.date > today).sort((x, y) => x.installmentNumber! - y.installmentNumber!);
}

export function cancelInstallments(a: Actions, d: AppData, plan: InstallmentPlan, today: ISODate) {
  const future = futureInstallments(d, plan.id, today);
  a.remove("transactions", future.map((t) => t.id));
  a.patch("installments", plan.id, { status: "cancelled" });
}

/** Antecipa as próximas `count` parcelas para hoje, com desconto opcional (juros abatidos). */
export function anticipateInstallments(a: Actions, d: AppData, plan: InstallmentPlan, count: number, discountPct: number, today: ISODate) {
  const rows = futureInstallments(d, plan.id, today).slice(0, count);
  for (const t of rows) {
    a.patch("transactions", t.id, {
      date: today, amount: Math.round(t.amount * (1 - discountPct / 100)), status: t.cardId ? "paid" : "pending",
    });
  }
  const left = futureInstallments(d, plan.id, today).length - rows.length;
  if (left <= 0) a.patch("installments", plan.id, { status: "completed" });
}

/* ───────────── Assinaturas ───────────── */

export function saveSubscription(a: Actions, values: Omit<Subscription, "id" | "generatedThrough" | "previousAmount"> & { id?: ID }, existing: Subscription | undefined, today: ISODate) {
  const base = { ...values } as Subscription;
  if (existing) {
    base.id = existing.id;
    base.generatedThrough = existing.generatedThrough;
    base.previousAmount = existing.amount !== values.amount ? existing.amount : existing.previousAmount;
  } else {
    base.id = uid();
    base.previousAmount = null;
    base.generatedThrough = lastOccurrenceOnOrBefore(base, today);
  }
  a.add("subscriptions", base);
}

/* ───────────── Investimentos ───────────── */

export function applyInvestmentMove(
  a: Actions, inv: Investment, m: { type: "aporte" | "resgate" | "rendimento"; amount: Cents; date: ISODate; accountId: ID | null },
) {
  let applied = inv.appliedAmount;
  let current = inv.currentValue;
  if (m.type === "aporte") { applied += m.amount; current += m.amount; }
  else if (m.type === "resgate") {
    const ratio = current > 0 ? Math.min(1, m.amount / current) : 0;
    applied = Math.round(applied * (1 - ratio));
    current = Math.max(0, current - m.amount);
  } else current += m.amount;
  a.patch("investments", inv.id, { appliedAmount: applied, currentValue: current, ...(m.type === "aporte" ? { contributionDate: m.date } : {}) });
  a.add("investmentTransactions", { id: uid(), investmentId: inv.id, date: m.date, type: m.type, amount: m.amount, accountId: m.accountId });
}

/** Registra um aporte/resgate a partir da página de investimentos (com movimentação na conta, se houver). */
export function investmentMoveWithAccount(
  a: Actions, d: AppData, inv: Investment, m: { type: "aporte" | "resgate" | "rendimento"; amount: Cents; date: ISODate; accountId: ID | null },
) {
  applyInvestmentMove(a, inv, m);
  if (m.accountId && m.type !== "rendimento") {
    a.add("transactions", {
      ...emptyTx(), kind: "investment", description: `${m.type === "aporte" ? "Aporte" : "Resgate"} — ${inv.name}`,
      amount: m.type === "aporte" ? m.amount : -m.amount, date: m.date, accountId: m.accountId, investmentId: inv.id,
      categoryId: d.categories.find((c) => c.name === "Investimentos" && !c.parentId)?.id ?? null, paymentMethod: "transferencia", status: "paid",
    });
  }
}

/* ───────────── Profissional ───────────── */

export function receiveCharge(a: Actions, d: AppData, p: ProfessionalIncome, accountId: ID, date: ISODate) {
  a.patch("professionalIncome", p.id, { status: "received", receivedDate: date, accountId });
  a.add("transactions", {
    ...emptyTx(), kind: "income", description: p.description, amount: p.amount, date, accountId, scope: "professional",
    categoryId: d.categories.find((c) => c.name === "Clientes" && !c.parentId)?.id ?? null, nature: "variable", paymentMethod: "pix",
    clientId: p.clientId, chargeId: p.id, status: "paid",
  });
}

export function undoReceive(a: Actions, d: AppData, p: ProfessionalIncome) {
  a.remove("transactions", d.transactions.filter((t) => t.chargeId === p.id).map((t) => t.id));
  a.patch("professionalIncome", p.id, { status: "pending", receivedDate: null });
}

/* ───────────── Patrimônio / categorias / contas ───────────── */

export function closeMonth(a: Actions, d: AppData, today: ISODate) {
  const nw = netWorth(d, today);
  const month = monthOf(today);
  const existing = d.snapshots.find((s) => s.month === month);
  a.add("snapshots", { id: existing?.id ?? uid(), month, assets: nw.totalAssets, liabilities: nw.totalLiabilities });
}

export function deleteCategory(a: Actions, d: AppData, id: ID) {
  const ids = [id, ...d.categories.filter((c) => c.parentId === id).map((c) => c.id)];
  for (const t of d.transactions.filter((x) => (x.categoryId && ids.includes(x.categoryId)) || (x.subcategoryId && ids.includes(x.subcategoryId))))
    a.patch("transactions", t.id, { categoryId: ids.includes(t.categoryId ?? "") ? null : t.categoryId, subcategoryId: null });
  a.remove("budgets", d.budgets.filter((b) => ids.includes(b.categoryId)).map((b) => b.id));
  a.remove("categories", ids);
}

export const accountHasHistory = (d: AppData, id: ID) =>
  d.transactions.some((t) => t.accountId === id || t.toAccountId === id) || d.creditCards.some((c) => c.accountId === id);

/** Serviço avulso (opcionalmente parcelado em N recebimentos mensais). */
export function createOneOffService(
  a: Actions, v: { description: string; clientId: ID | null; amount: Cents; dueDate: ISODate; installments: number },
) {
  const parts = splitInstallments(v.amount, Math.max(1, v.installments));
  const rows: ProfessionalIncome[] = parts.map((amount, i) => {
    const dueDate = addMonths(v.dueDate, i);
    return {
      id: uid(), clientId: v.clientId, description: parts.length > 1 ? `${v.description} (${i + 1}/${parts.length})` : v.description,
      amount, dueDate, receivedDate: null, status: "pending", type: "avulso", competence: monthOf(dueDate), accountId: null,
    };
  });
  a.add("professionalIncome", rows);
}
