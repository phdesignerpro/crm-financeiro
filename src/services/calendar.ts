import type { AppData, ISODate, MonthKey } from "@/types";
import { monthEnd, monthOf, monthStart } from "@/utils/date";
import { plannedEvents, scheduledEvents } from "./commitments";

export type CalKind = "in" | "out" | "card" | "invest" | "pro";
export interface CalEvent { id: string; date: ISODate; label: string; amount: number; kind: CalKind; done: boolean }

export const CAL_LABEL: Record<CalKind, string> = { in: "Entrada", out: "Saída", card: "Cartão", invest: "Investimento", pro: "Recebimento profissional" };
export const CAL_COLOR: Record<CalKind, string> = { in: "bg-income", out: "bg-expense", card: "bg-info", invest: "bg-invest", pro: "bg-warn" };

/** Eventos do mês: lançamentos já realizados + compromissos e recebimentos futuros. */
export function calendarEvents(d: AppData, month: MonthKey, today: ISODate): CalEvent[] {
  const from = monthStart(month), to = monthEnd(month);
  const out: CalEvent[] = [];
  for (const t of d.transactions) {
    if (t.date < from || t.date > to || t.status !== "paid") continue;
    if (t.kind === "income") out.push({ id: t.id, date: t.date, label: t.description, amount: t.amount, kind: t.scope === "professional" ? "pro" : "in", done: true });
    else if (t.kind === "expense" && !t.cardId) out.push({ id: t.id, date: t.date, label: t.description, amount: t.amount, kind: "out", done: true });
    else if (t.kind === "invoice_payment") out.push({ id: t.id, date: t.date, label: t.description, amount: t.amount, kind: "card", done: true });
    else if (t.kind === "investment") out.push({ id: t.id, date: t.date, label: t.description, amount: Math.abs(t.amount), kind: "invest", done: true });
  }
  if (to >= today) {
    const start = today > from ? today : from;
    const events = [...scheduledEvents(d, start, to), ...plannedEvents(d, start, to, { includeGoals: true })];
    for (const e of events) {
      if (monthOf(e.date) !== month) continue;
      const kind: CalKind = e.type === "invoice" ? "card" : e.type === "professional" ? "pro" : e.direction === "in" ? "in" : ["investment", "reserve", "goal"].includes(e.type) ? "invest" : "out";
      out.push({ id: e.id, date: e.date, label: e.label, amount: e.amount, kind, done: false });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
