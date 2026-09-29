import type {
  Cents, CreditCard, Frequency, ID, InstallmentPlan, ISODate, Nature, PaymentMethod,
  RecurringTransaction, Scope, Transaction, TxStatus,
} from "@/types";
import { addMonths } from "@/utils/date";
import { uid } from "@/utils/id";
import { splitInstallments } from "@/utils/money";

export const emptyTx = (): Transaction => ({
  id: uid(), kind: "expense", description: "", amount: 0, date: "", status: "paid", categoryId: null, subcategoryId: null,
  accountId: null, toAccountId: null, cardId: null, paymentMethod: "pix", nature: "variable", scope: "personal", tags: [],
  notes: "", recurringId: null, subscriptionId: null, installmentId: null, installmentNumber: null, installmentCount: null,
  invoiceKey: null, investmentId: null, clientId: null, chargeId: null, createdAt: new Date().toISOString(),
});

export type EntryKind = "income" | "expense" | "card" | "transfer" | "investment";

export interface EntryValues {
  entry: EntryKind;
  description: string;
  amount: Cents;
  date: ISODate;
  categoryId: ID | null;
  subcategoryId: ID | null;
  accountId: ID | null;
  toAccountId: ID | null;
  cardId: ID | null;
  investmentId: ID | null;
  paymentMethod: PaymentMethod;
  nature: Nature;
  scope: Scope;
  tags: string[];
  notes: string;
  recurring: boolean;
  frequency: Frequency;
  installments: number;
  /** Já efetivado (afeta o saldo)? Compras no cartão são sempre efetivadas na data. */
  paid: boolean;
}

export interface BuiltEntry {
  transactions: Transaction[];
  plan: InstallmentPlan | null;
  rule: RecurringTransaction | null;
}

/** Cria as parcelas de uma compra parcelada (ver item 9 da especificação). */
export function buildInstallments(args: {
  description: string; total: Cents; count: number; date: ISODate; cardId: ID | null; accountId: ID | null;
  categoryId: ID | null; subcategoryId?: ID | null; scope: Scope; nature: Nature; today: ISODate;
  paymentMethod?: PaymentMethod; tags?: string[]; notes?: string; firstPaid?: boolean;
}): { plan: InstallmentPlan; transactions: Transaction[] } {
  const plan: InstallmentPlan = {
    id: uid(), description: args.description, total: args.total, count: args.count, startDate: args.date,
    cardId: args.cardId, accountId: args.accountId, categoryId: args.categoryId, scope: args.scope,
    status: "active", createdAt: new Date().toISOString(),
  };
  const amounts = splitInstallments(args.total, args.count);
  const transactions = amounts.map((amount, i): Transaction => {
    const date = addMonths(args.date, i);
    const status: TxStatus = args.cardId
      ? date <= args.today ? "paid" : "pending"
      : i === 0 && args.firstPaid ? "paid" : "pending";
    return {
      ...emptyTx(), kind: "expense", description: args.description, amount, date, status, categoryId: args.categoryId,
      subcategoryId: args.subcategoryId ?? null, accountId: args.accountId, cardId: args.cardId,
      paymentMethod: args.paymentMethod ?? (args.cardId ? "credito" : "boleto"), nature: args.nature, scope: args.scope,
      tags: args.tags ?? [], notes: args.notes ?? "", installmentId: plan.id, installmentNumber: i + 1, installmentCount: args.count,
    };
  });
  return { plan, transactions };
}

/** Converte o formulário rápido em lançamentos, plano de parcelas e regra de recorrência. */
export function buildEntry(v: EntryValues, today: ISODate, cards: CreditCard[]): BuiltEntry {
  const common = {
    description: v.description.trim(), amount: v.amount, date: v.date, categoryId: v.categoryId, subcategoryId: v.subcategoryId,
    nature: v.nature, scope: v.scope, tags: v.tags, notes: v.notes,
  };

  if (v.entry === "transfer") {
    const tx: Transaction = {
      ...emptyTx(), ...common, kind: "transfer", categoryId: null, subcategoryId: null, accountId: v.accountId, toAccountId: v.toAccountId,
      paymentMethod: "transferencia", status: "paid",
    };
    return { transactions: [tx], plan: null, rule: null };
  }

  if (v.entry === "investment") {
    const tx: Transaction = {
      ...emptyTx(), ...common, kind: "investment", accountId: v.accountId, investmentId: v.investmentId, paymentMethod: "transferencia",
      status: "paid", nature: "variable",
    };
    return { transactions: [tx], plan: null, rule: null };
  }

  if (v.entry === "card") {
    const card = cards.find((c) => c.id === v.cardId);
    if (v.installments > 1) {
      const { plan, transactions } = buildInstallments({
        description: common.description, total: v.amount, count: v.installments, date: v.date, cardId: v.cardId,
        accountId: card?.accountId ?? null, categoryId: v.categoryId, subcategoryId: v.subcategoryId, scope: v.scope,
        nature: v.nature, today, tags: v.tags, notes: v.notes,
      });
      return { transactions, plan, rule: null };
    }
    const tx: Transaction = {
      ...emptyTx(), ...common, kind: "expense", cardId: v.cardId, accountId: card?.accountId ?? null, paymentMethod: "credito",
      status: v.date <= today ? "paid" : "pending",
    };
    return { transactions: [tx], plan: null, rule: v.recurring ? ruleFrom(tx, v.frequency) : null };
  }

  const kind = v.entry === "income" ? "income" : "expense";
  if (kind === "expense" && v.installments > 1) {
    const { plan, transactions } = buildInstallments({
      description: common.description, total: v.amount, count: v.installments, date: v.date, cardId: null, accountId: v.accountId,
      categoryId: v.categoryId, subcategoryId: v.subcategoryId, scope: v.scope, nature: v.nature, today,
      paymentMethod: v.paymentMethod, tags: v.tags, notes: v.notes, firstPaid: v.paid,
    });
    return { transactions, plan, rule: null };
  }
  const tx: Transaction = {
    ...emptyTx(), ...common, kind, accountId: v.accountId, paymentMethod: v.paymentMethod, status: v.paid ? "paid" : "pending",
  };
  return { transactions: [tx], plan: null, rule: v.recurring ? ruleFrom(tx, v.frequency) : null };
}

function ruleFrom(tx: Transaction, frequency: Frequency): RecurringTransaction {
  const rule: RecurringTransaction = {
    id: uid(), kind: tx.kind === "income" ? "income" : "expense", description: tx.description, amount: tx.amount,
    categoryId: tx.categoryId, accountId: tx.accountId, cardId: tx.cardId, scope: tx.scope, nature: tx.nature, tags: tx.tags,
    frequency, startDate: tx.date, endDate: null, active: true, generatedThrough: tx.date,
  };
  tx.recurringId = rule.id;
  return rule;
}

export function valuesFromTransaction(t: Transaction): EntryValues {
  const entry: EntryKind =
    t.kind === "income" ? "income" : t.kind === "transfer" ? "transfer" : t.kind === "investment" ? "investment" : t.cardId ? "card" : "expense";
  return {
    entry, description: t.description, amount: Math.abs(t.amount), date: t.date, categoryId: t.categoryId, subcategoryId: t.subcategoryId,
    accountId: t.accountId, toAccountId: t.toAccountId, cardId: t.cardId, investmentId: t.investmentId, paymentMethod: t.paymentMethod,
    nature: t.nature, scope: t.scope, tags: t.tags, notes: t.notes, recurring: !!t.recurringId, frequency: "monthly",
    installments: 1, paid: t.status === "paid",
  };
}
