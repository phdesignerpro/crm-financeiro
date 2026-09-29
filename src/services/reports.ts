import type { AppData, Cents, ISODate, MonthKey } from "@/types";
import { addMonthsKey, monthEnd, monthOf, monthStart, monthsBetween } from "@/utils/date";
import { sum } from "@/utils/money";
import { cardInvoices, spendingByCategory } from "./finance";
import { netWorthHistory } from "./networth";
import { annualEquivalent, monthlyEquivalent } from "./schedule";

export type ReportPeriod = "month" | "quarter" | "semester" | "year" | "custom";

export function periodRange(kind: ReportPeriod, today: ISODate, custom?: { from: ISODate; to: ISODate }): { from: ISODate; to: ISODate } {
  const cur = monthOf(today);
  switch (kind) {
    case "month": return { from: monthStart(cur), to: monthEnd(cur) };
    case "quarter": return { from: monthStart(addMonthsKey(cur, -2)), to: monthEnd(cur) };
    case "semester": return { from: monthStart(addMonthsKey(cur, -5)), to: monthEnd(cur) };
    case "year": return { from: monthStart(addMonthsKey(cur, -11)), to: monthEnd(cur) };
    case "custom": return custom ?? { from: monthStart(cur), to: monthEnd(cur) };
  }
}

export function buildReport(d: AppData, from: ISODate, to: ISODate, today: ISODate) {
  const inRange = d.transactions.filter((t) => t.status === "paid" && t.date >= from && t.date <= to);
  const income = sum(inRange.filter((t) => t.kind === "income").map((t) => t.amount));
  const expense = sum(inRange.filter((t) => t.kind === "expense").map((t) => t.amount));
  const result = income - expense;
  const months = monthsBetween(monthOf(from), monthOf(to));
  const series = months.map((m) => {
    const tx = inRange.filter((t) => monthOf(t.date) === m);
    const i = sum(tx.filter((t) => t.kind === "income").map((t) => t.amount));
    const e = sum(tx.filter((t) => t.kind === "expense").map((t) => t.amount));
    return { month: m, income: i, expense: e, result: i - e };
  });
  const invested = sum(d.investmentTransactions.filter((t) => t.type === "aporte" && t.date >= from && t.date <= to).map((t) => t.amount));
  const nw = netWorthHistory(d, today, 24).filter((p) => p.month >= monthOf(from) && p.month <= monthOf(to));
  const cardRows = d.creditCards.map((c) => {
    const spent = sum(inRange.filter((t) => t.kind === "expense" && t.cardId === c.id).map((t) => t.amount));
    const invs = cardInvoices(c, d.transactions, today).filter((i) => i.key >= monthOf(from) && i.key <= monthOf(to));
    return { card: c, spent, invoices: invs.length, remaining: sum(invs.map((i) => i.remaining)) };
  });
  const subs = d.subscriptions.filter((s) => s.active);
  return {
    from, to, income, expense, result, savingsRate: income > 0 ? (result / income) * 100 : 0, series, invested,
    categories: spendingByCategory(d, from, to, "all"),
    netWorth: { start: nw[0]?.net ?? 0, end: nw[nw.length - 1]?.net ?? 0, points: nw },
    cards: cardRows,
    subscriptions: { monthly: sum(subs.map((s) => monthlyEquivalent(s.amount, s.frequency))), annual: sum(subs.map((s) => annualEquivalent(s.amount, s.frequency))), count: subs.length },
    transactions: inRange,
  };
}

export type Report = ReturnType<typeof buildReport>;
export type { Cents, MonthKey };
