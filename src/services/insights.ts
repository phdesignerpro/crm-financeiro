import type { AppData, ISODate } from "@/types";
import { addMonthsKey, dayOf, formatDate, monthEnd, monthOf, monthStart } from "@/utils/date";
import { formatBRL, formatPct, sum } from "@/utils/money";
import { annualEquivalent, monthlyEquivalent } from "./schedule";
import { availableForReal, projectCashflow, upcomingCommitments } from "./commitments";
import { allCardSummaries, budgetStatuses, lastDaysRange, monthSummary, pctChange, spendingByCategory } from "./finance";
import { netWorthChange } from "./networth";
import { emergencyStatus, goalStatus, investmentStats } from "./planning";
import { professionalSummary } from "./professional";

export type Tone = "positive" | "negative" | "warning" | "info";

export interface Insight {
  id: string;
  tone: Tone;
  text: string;
  href?: string;
  area: string;
}

/** Gera insights a partir dos dados reais cadastrados. Nada aqui é texto genérico. */
export function generateInsights(d: AppData, today: ISODate): Insight[] {
  const out: Insight[] = [];
  const add = (i: Insight) => out.push(i);
  const cur = monthOf(today);
  const prev = addMonthsKey(cur, -1);
  const day = dayOf(today);

  const now = monthSummary(d, cur, "all");
  const before = monthSummary(d, prev, "all", day);

  if (before.expense > 0 && now.expense > 0) {
    const ch = pctChange(now.expense, before.expense);
    if (Math.abs(ch) >= 1)
      add({
        id: "exp-change", area: "Despesas", href: "/movimentacoes", tone: ch > 0 ? "negative" : "positive",
        text: `Seus gastos ${ch > 0 ? "aumentaram" : "diminuíram"} ${formatPct(Math.abs(ch), 0)} em relação ao mês passado (mesmo período).`,
      });
  }

  // categoria que mais cresceu
  const a = spendingByCategory(d, monthStart(cur), monthEnd(cur));
  const b = spendingByCategory(d, monthStart(prev), monthEnd(prev).slice(0, 8) + String(day).padStart(2, "0"));
  const growth = a
    .map((c) => ({ ...c, delta: c.total - (b.find((x) => x.categoryId === c.categoryId)?.total ?? 0) }))
    .sort((x, y) => y.delta - x.delta)[0];
  if (growth && growth.delta > 0)
    add({
      id: "cat-growth", area: "Categorias", href: "/relatorios", tone: "warning",
      text: `${growth.name} foi a categoria que mais cresceu neste mês: ${formatBRL(growth.delta)} a mais que no mesmo período do mês passado.`,
    });

  // delivery
  const [f30, t30] = lastDaysRange(today, 30);
  const delivery = d.categories.find((c) => c.name === "Delivery");
  if (delivery) {
    const total = spendingByCategory(d, f30, t30).find((c) => c.categoryId === delivery.id)?.total ?? 0;
    if (total > 0) add({ id: "delivery", area: "Categorias", tone: "warning", href: "/movimentacoes", text: `Você gastou ${formatBRL(total)} com delivery nos últimos 30 dias.` });
  }

  // assinaturas
  const subs = d.subscriptions.filter((s) => s.active);
  if (subs.length) {
    const annual = sum(subs.map((s) => annualEquivalent(s.amount, s.frequency)));
    add({ id: "subs-annual", area: "Assinaturas", tone: "info", href: "/assinaturas", text: `Suas ${subs.length} assinaturas representam ${formatBRL(annual)} por ano (${formatBRL(sum(subs.map((s) => monthlyEquivalent(s.amount, s.frequency))))} por mês).` });
    for (const s of subs.filter((x) => x.previousAmount && x.previousAmount < x.amount))
      add({ id: `sub-up-${s.id}`, area: "Assinaturas", tone: "warning", href: "/assinaturas", text: `${s.name} aumentou de ${formatBRL(s.previousAmount!)} para ${formatBRL(s.amount)} (+${formatPct(pctChange(s.amount, s.previousAmount!), 0)}).` });
    const low = subs.filter((s) => s.usage === "baixo");
    if (low.length)
      add({ id: "sub-low", area: "Assinaturas", tone: "warning", href: "/assinaturas", text: `${low.map((s) => s.name).join(" e ")} ${low.length > 1 ? "estão" : "está"} marcada${low.length > 1 ? "s" : ""} como pouco utilizada${low.length > 1 ? "s" : ""}: cancelar economizaria ${formatBRL(sum(low.map((s) => annualEquivalent(s.amount, s.frequency))))} por ano.` });
  }

  // economia
  if (now.income > 0)
    add({ id: "savings", area: "Economia", tone: now.savingsRate >= 20 ? "positive" : now.savingsRate >= 0 ? "info" : "negative", href: "/saude", text: `Você ${now.result >= 0 ? "economizou" : "gastou além da renda:"} ${formatPct(Math.abs(now.savingsRate), 0)} da sua renda neste mês (${formatBRL(now.result)}).` });

  // patrimônio
  const nw = netWorthChange(d, today, 6);
  if (nw.from)
    add({ id: "nw", area: "Patrimônio", tone: nw.delta >= 0 ? "positive" : "negative", href: "/patrimonio", text: `Seu patrimônio ${nw.delta >= 0 ? "cresceu" : "caiu"} ${formatBRL(Math.abs(nw.delta))} nos últimos 6 meses.` });

  // reserva
  const res = emergencyStatus(d, today);
  if (res.essential > 0) {
    add({ id: "reserve", area: "Reserva", tone: res.monthsCovered >= 6 ? "positive" : res.monthsCovered >= 3 ? "info" : "warning", href: "/reserva", text: `Você já possui ${res.monthsCovered.toFixed(1).replace(".", ",")} meses de reserva de emergência.` });
    if (res.missing > 0 && res.etaMonths != null)
      add({ id: "reserve-eta", area: "Reserva", tone: "info", href: "/reserva", text: `Se mantiver seus aportes atuais (${formatBRL(res.monthlyContribution)}/mês), sua reserva poderá atingir a meta de ${res.targetMonths} meses em aproximadamente ${res.etaMonths} ${res.etaMonths === 1 ? "mês" : "meses"}.` });
  }

  // disponível
  const av = availableForReal(d, today);
  add({ id: "free", area: "Fluxo", tone: av.available > 0 ? "positive" : "negative", href: "/", text: av.available >= 0 ? `Você possui ${formatBRL(av.available)} potencialmente livres após considerar seus compromissos financeiros cadastrados (${formatBRL(av.totalCommitted)} nos próximos ${av.horizonDays} dias).` : `Seus compromissos dos próximos ${av.horizonDays} dias (${formatBRL(av.totalCommitted)}) superam seu saldo em ${formatBRL(-av.available)}.` });

  // próximos 7 dias
  const next7 = sum(upcomingCommitments(d, today, 7).map((e) => e.amount));
  if (next7 > 0) add({ id: "next7", area: "Fluxo", tone: "info", href: "/planejamento", text: `Você tem ${formatBRL(next7)} em contas e faturas nos próximos 7 dias.` });

  // cartões
  for (const c of allCardSummaries(d, today))
    if (c.usedPct >= 30)
      add({ id: `card-${c.card.id}`, area: "Cartões", tone: c.usedPct >= 70 ? "negative" : "warning", href: "/cartoes", text: `Você já utilizou ${formatPct(c.usedPct, 0)} do limite do ${c.card.name} (${formatBRL(c.used)} de ${formatBRL(c.card.limit)}).` });

  // orçamento
  for (const b of budgetStatuses(d, cur).filter((x) => x.level !== "ok").slice(0, 3))
    add({ id: `bud-${b.budgetId}`, area: "Orçamento", tone: b.pct >= 100 ? "negative" : "warning", href: "/planejamento", text: `${b.category.name}: ${formatBRL(b.spent)} de ${formatBRL(b.limit)} (${formatPct(b.pct, 0)} do orçamento).` });

  // metas
  for (const g of d.goals) {
    const s = goalStatus(g, today);
    if (s.status === "atrasada")
      add({ id: `goal-${g.id}`, area: "Metas", tone: "warning", href: "/metas", text: `Para atingir "${g.name}" até ${formatDate(g.deadline)}, o ideal é guardar ${formatBRL(s.requiredMonthly)} por mês; o aporte planejado é ${formatBRL(g.monthly)}.` });
  }

  // profissional
  const pro = professionalSummary(d, cur, today);
  if (pro.delinquentClients > 0)
    add({ id: "pro-overdue", area: "Profissional", tone: "negative", href: "/profissional", text: `${pro.delinquentClients} cliente${pro.delinquentClients > 1 ? "s possuem" : " possui"} pagamento vencido, totalizando ${formatBRL(pro.overdue)}.` });
  if (pro.mrr > 0) add({ id: "mrr", area: "Profissional", tone: "info", href: "/profissional", text: `Sua receita recorrente (MRR) é ${formatBRL(pro.mrr)} e o lucro profissional estimado do mês é ${formatBRL(pro.profit)}.` });

  // investimentos (educativo)
  const inv = investmentStats(d, cur);
  const top = inv.allocation[0];
  if (top && top.pct >= 40)
    add({ id: "alloc", area: "Investimentos", tone: "info", href: "/investimentos", text: `${formatPct(top.pct, 0)} da sua carteira está em "${top.label}". Diversificar entre classes e prazos costuma reduzir a dependência de um único tipo de risco — avalie conforme seus objetivos e perfil.` });

  // projeção
  const proj = projectCashflow(d, today, 90);
  if (proj.minBalance < 0)
    add({ id: "neg-proj", area: "Fluxo", tone: "negative", href: "/planejamento", text: `Pela projeção, seu saldo pode ficar negativo (${formatBRL(proj.minBalance)}) em ${formatDate(proj.minDate)} se nada mudar.` });

  return out;
}
