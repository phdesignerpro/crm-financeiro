import type { AppData, ISODate } from "@/types";
import { addDays, diffDays, monthOf, relativeDays } from "@/utils/date";
import { formatBRL, formatPct, sum } from "@/utils/money";
import { scheduledEvents, upcomingCommitments } from "./commitments";
import { allCardSummaries, budgetStatuses } from "./finance";
import { daysLate, isOverdue } from "./professional";

export type AlertLevel = "danger" | "warning" | "info";

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  body: string;
  href: string;
  read: boolean;
}

/** Central de alertas: todas derivadas das regras e dos dados atuais. */
export function buildAlerts(d: AppData, today: ISODate): Alert[] {
  const out: Omit<Alert, "read">[] = [];
  const cur = monthOf(today);

  for (const s of allCardSummaries(d, today)) {
    for (const inv of s.unpaid) {
      const diff = diffDays(inv.dueDate, today);
      if (inv.status === "aberta" && diff > 7) continue;
      if (diff <= 3 && inv.closingDate < today)
        out.push({
          id: `inv:${s.card.id}:${inv.key}:${diff < 0 ? "late" : "soon"}`, level: diff < 0 ? "danger" : "warning",
          title: diff < 0 ? `Fatura ${s.card.name} vencida` : diff === 0 ? `Fatura ${s.card.name} vence hoje` : `Fatura vence em ${diff} ${diff === 1 ? "dia" : "dias"}`,
          body: `${s.card.name}: ${formatBRL(inv.remaining)} com vencimento ${relativeDays(inv.dueDate, today)}.`, href: "/cartoes",
        });
    }
    const th = [90, 70, 50, 30].find((t) => s.usedPct >= t);
    if (th)
      out.push({ id: `limit:${s.card.id}:${th}`, level: th >= 70 ? "danger" : "warning", title: `Você já utilizou ${th}% do limite`, body: `${s.card.name}: ${formatBRL(s.used)} de ${formatBRL(s.card.limit)} (${formatPct(s.usedPct, 0)}).`, href: "/cartoes" });
  }

  for (const b of budgetStatuses(d, cur)) {
    if (b.level === "ok") continue;
    out.push({
      id: `budget:${b.budgetId}:${cur}:${b.level}`, level: b.level === "70" ? "warning" : "danger",
      title: b.level === "100" ? `Orçamento de ${b.category.name} estourado` : `Você atingiu ${b.level}% do orçamento de ${b.category.name}`,
      body: `${formatBRL(b.spent)} de ${formatBRL(b.limit)} (${formatPct(b.pct, 0)}).`, href: "/planejamento",
    });
  }

  for (const e of scheduledEvents(d, today, addDays(today, 3))) {
    if (e.type !== "subscription" || e.direction !== "out") continue;
    const diff = diffDays(e.date, today);
    out.push({ id: `sub:${e.id}`, level: "info", title: `${e.label} será cobrada ${relativeDays(e.date, today)}`, body: `Valor: ${formatBRL(e.amount)}.`, href: "/assinaturas" });
    void diff;
  }

  const week = sum(upcomingCommitments(d, today, 7).map((e) => e.amount));
  if (week > 0) out.push({ id: `week:${today}`, level: "info", title: `Você tem ${formatBRL(week)} em contas nos próximos 7 dias`, body: "Inclui contas, assinaturas, parcelas e faturas.", href: "/planejamento" });

  const overdueBills = d.transactions.filter((t) => t.status === "pending" && t.kind === "expense" && !t.cardId && t.date < today);
  for (const t of overdueBills.slice(0, 5))
    out.push({ id: `late:${t.id}`, level: "danger", title: `Conta em atraso: ${t.description}`, body: `${formatBRL(t.amount)} venceu ${relativeDays(t.date, today)}.`, href: "/movimentacoes" });

  for (const p of d.professionalIncome.filter((x) => isOverdue(x, today))) {
    const client = d.clients.find((c) => c.id === p.clientId);
    out.push({ id: `client:${p.id}`, level: "danger", title: `${client?.name ?? "Cliente"} possui pagamento vencido`, body: `${formatBRL(p.amount)} em atraso há ${daysLate(p, today)} dias.`, href: "/profissional" });
  }

  const order: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };
  const readIds = new Set(d.notifications.filter((n) => n.readAt).map((n) => n.id));
  return out.sort((a, b) => order[a.level] - order[b.level]).map((a) => ({ ...a, read: readIds.has(a.id) }));
}
