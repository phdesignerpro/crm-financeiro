import type { AppData, Cents, Client, ISODate, MonthKey, ProfessionalIncome } from "@/types";
import { addMonthsKey, diffDays, monthOf } from "@/utils/date";
import { sum } from "@/utils/money";
import { virtualCharges } from "./schedule";

export type ClientStatus = "ativo" | "inadimplente" | "pausado" | "encerrado";

export const isOverdue = (p: ProfessionalIncome, today: ISODate) => p.status === "pending" && p.dueDate < today;

export interface ClientStats {
  client: Client;
  status: ClientStatus;
  totalRevenue: Cents;
  costs: Cents;
  profit: Cents;
  pending: Cents;
  overdue: Cents;
  monthsBilled: number;
  nextDue: ISODate | null;
}

export function clientStats(d: AppData, c: Client, today: ISODate): ClientStats {
  const charges = d.professionalIncome.filter((p) => p.clientId === c.id);
  const received = charges.filter((p) => p.status === "received");
  const totalRevenue = sum(received.map((p) => p.amount));
  const monthsBilled = new Set(charges.filter((p) => p.type === "recorrente").map((p) => p.competence)).size;
  // custos: custo mensal estimado × meses faturados + despesas lançadas diretamente para o cliente
  const direct = sum(d.transactions.filter((t) => t.kind === "expense" && t.clientId === c.id && t.status === "paid").map((t) => t.amount));
  const costs = c.monthlyCost * monthsBilled + direct;
  const overdueList = charges.filter((p) => isOverdue(p, today));
  const upcoming = charges.filter((p) => p.status === "pending" && p.dueDate >= today).map((p) => p.dueDate).sort();
  const status: ClientStatus = c.status === "ativo" && overdueList.length ? "inadimplente" : c.status;
  return {
    client: c, status, totalRevenue, costs, profit: totalRevenue - costs,
    pending: sum(charges.filter((p) => p.status === "pending").map((p) => p.amount)),
    overdue: sum(overdueList.map((p) => p.amount)), monthsBilled, nextDue: upcoming[0] ?? null,
  };
}

export function professionalSummary(d: AppData, month: MonthKey, today: ISODate) {
  const active = d.clients.filter((c) => c.status === "ativo");
  const stats = d.clients.map((c) => clientStats(d, c, today));
  const mrr = sum(active.map((c) => c.monthlyValue));
  const monthCharges = d.professionalIncome.filter((p) => p.status === "received" && p.receivedDate && monthOf(p.receivedDate) === month);
  const recurringReceived = sum(monthCharges.filter((p) => p.type === "recorrente").map((p) => p.amount));
  const oneOffReceived = sum(monthCharges.filter((p) => p.type === "avulso").map((p) => p.amount));
  const revenue = recurringReceived + oneOffReceived;
  const expenses = sum(d.transactions.filter((t) => t.kind === "expense" && t.scope === "professional" && t.status === "paid" && monthOf(t.date) === month).map((t) => t.amount));
  const receivables = sum(d.professionalIncome.filter((p) => p.status === "pending").map((p) => p.amount));
  const overdueCharges = d.professionalIncome.filter((p) => isOverdue(p, today));
  return {
    mrr, recurringReceived, oneOffReceived, revenue, expenses, profit: revenue - expenses,
    activeClients: active.length - stats.filter((s) => s.status === "inadimplente").length,
    delinquentClients: stats.filter((s) => s.status === "inadimplente").length,
    receivables, overdue: sum(overdueCharges.map((p) => p.amount)), overdueCharges, stats,
  };
}

export const daysLate = (p: ProfessionalIncome, today: ISODate) => Math.max(0, diffDays(today, p.dueDate));

export interface ForecastMonth {
  month: MonthKey;
  recurring: Cents;
  oneOff: Cents;
  received: Cents;
  total: Cents;
  items: { id: string; date: ISODate; label: string; amount: Cents; type: "recorrente" | "avulso"; virtual: boolean; chargeId?: string }[];
}

/** Previsão de recebimentos dos próximos meses: mensalidades (inclusive as ainda não geradas) + avulsos pendentes. */
export function receivableForecast(d: AppData, today: ISODate, months = 6): ForecastMonth[] {
  const start = monthOf(today);
  const end = addMonthsKey(start, months - 1);
  const virtual = virtualCharges(d, start, end);
  const out: ForecastMonth[] = [];
  for (let m = start; m <= end; m = addMonthsKey(m, 1)) {
    const real = d.professionalIncome.filter((p) => p.status === "pending" && p.dueDate >= today && monthOf(p.dueDate) === m);
    const virt = virtual.filter((p) => monthOf(p.dueDate) === m && p.dueDate >= today);
    const items = [...real.map((p) => ({ p, v: false })), ...virt.map((p) => ({ p, v: true }))]
      .map(({ p, v }) => ({ id: p.id, date: p.dueDate, label: p.description, amount: p.amount, type: p.type, virtual: v, chargeId: v ? undefined : p.id }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const received = sum(d.professionalIncome.filter((p) => p.status === "received" && p.receivedDate && monthOf(p.receivedDate) === m).map((p) => p.amount));
    const recurring = sum(items.filter((i) => i.type === "recorrente").map((i) => i.amount));
    const oneOff = sum(items.filter((i) => i.type === "avulso").map((i) => i.amount));
    out.push({ month: m, recurring, oneOff, received, total: recurring + oneOff, items });
  }
  return out;
}
