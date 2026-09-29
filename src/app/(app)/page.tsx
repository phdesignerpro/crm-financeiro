"use client";
import {
  Banknote, CreditCard, Landmark, LineChart, PiggyBank, Percent, Scale, ShieldCheck, SlidersHorizontal, TrendingDown, TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AvailableCard } from "@/components/dashboard/AvailableCard";
import { CustomizeModal, normalizeOrder } from "@/components/dashboard/CustomizeModal";
import { Upcoming } from "@/components/dashboard/Upcoming";
import { AreaTrend, Donut, IncomeExpenseChart, Legend2, StackedBars, useChartColors } from "@/components/charts/ChartKit";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, type StatCardProps } from "@/components/ui/StatCard";
import { useData, useToday } from "@/hooks/useStore";
import { availableForReal } from "@/services/commitments";
import { generateInsights } from "@/services/insights";
import { cashBalance, monthlySeries, monthSummary, openInvoicesTotal, pctChange, spendingByCategory, spendingByNature, allCardSummaries } from "@/services/finance";
import { netWorth, netWorthHistory } from "@/services/networth";
import { emergencyStatus, investmentStats } from "@/services/planning";
import type { Scope } from "@/types";
import { addMonthsKey, dayOf, lastMonths, monthEnd, monthLabel, monthOf, monthShort, monthShortYear, monthStart } from "@/utils/date";
import { formatBRL, formatPct } from "@/utils/money";
import { cn } from "@/utils/cn";

export default function DashboardPage() {
  const d = useData();
  const today = useToday();
  const c = useChartColors();
  const [scope, setScope] = useState<Scope | "all">("all");
  const [custom, setCustom] = useState(false);
  const cur = monthOf(today);
  const prev = addMonthsKey(cur, -1);

  const m = useMemo(() => {
    const now = monthSummary(d, cur, scope);
    const before = monthSummary(d, prev, scope, dayOf(today));
    const nw = netWorth(d, today);
    const hist = netWorthHistory(d, today, 12);
    const res = emergencyStatus(d, today);
    const inv = investmentStats(d, cur);
    const cards = allCardSummaries(d, today);
    const months6 = lastMonths(cur, 6);
    const [from, to] = [monthStart(cur), monthEnd(cur)];
    return {
      now, before, nw, hist, res, inv, cards, available: availableForReal(d, today),
      series: monthlySeries(d, months6, scope).map((r) => ({ label: monthShort(r.month), income: r.income, expense: r.expense })),
      categories: spendingByCategory(d, from, to, scope),
      natureSeries: months6.map((mm) => ({ label: monthShort(mm), ...spendingByNature(d, mm, scope) })),
      insights: generateInsights(d, today).slice(0, 4),
    };
  }, [d, today, scope, cur, prev]);

  const nwPrev = m.hist.length > 1 ? m.hist[m.hist.length - 2].net : null;
  const total = m.categories.reduce((s, x) => s + x.total, 0);
  const top = m.categories.slice(0, 8);
  const rest = total - top.reduce((s, x) => s + x.total, 0);
  const donut = [...top.map((x) => ({ name: x.name, value: x.total, color: x.color })), ...(rest > 0 ? [{ name: "Outras", value: rest, color: c.muted }] : [])];

  const cardDefs: Record<string, StatCardProps> = {
    networth: { label: "Patrimônio líquido", value: formatBRL(m.nw.net), tone: "invest", icon: <Landmark size={15} />, delta: nwPrev ? pctChange(m.nw.net, nwPrev) : null },
    cash: { label: "Saldo disponível", value: formatBRL(cashBalance(d)), tone: "info", icon: <Banknote size={15} />, hint: `${d.accounts.filter((a) => !a.archived).length} contas` },
    income: { label: "Receita do mês", value: formatBRL(m.now.income), tone: "income", icon: <TrendingUp size={15} />, delta: pctChange(m.now.income, m.before.income) },
    expense: { label: "Despesas do mês", value: formatBRL(m.now.expense), tone: "expense", icon: <TrendingDown size={15} />, delta: pctChange(m.now.expense, m.before.expense), invertDelta: true },
    result: { label: "Resultado do mês", value: formatBRL(m.now.result), tone: m.now.result >= 0 ? "income" : "expense", icon: <Scale size={15} />, delta: m.before.result ? pctChange(m.now.result, m.before.result) : null },
    saved: { label: "Valor economizado", value: formatBRL(Math.max(0, m.now.result)), tone: "income", icon: <PiggyBank size={15} />, hint: `${formatPct(Math.max(0, m.now.savingsRate), 1)} da renda` },
    savingsRate: { label: "Taxa de economia", value: formatPct(m.now.savingsRate, 1), tone: m.now.savingsRate >= 20 ? "income" : m.now.savingsRate >= 10 ? "warn" : "expense", icon: <Percent size={15} />, hint: `Mês anterior: ${formatPct(m.before.savingsRate, 1)}` },
    invested: { label: "Investido no mês", value: formatBRL(m.now.invested), tone: "invest", icon: <LineChart size={15} />, hint: m.now.income ? `${formatPct((m.now.invested / m.now.income) * 100, 0)} da renda` : undefined },
    reserve: { label: "Reserva de emergência", value: formatBRL(m.res.current), tone: "info", icon: <ShieldCheck size={15} />, hint: `${m.res.monthsCovered.toFixed(1).replace(".", ",")} meses · ${formatPct(m.res.pct, 0)} da meta` },
    invoices: { label: "Faturas de cartão abertas", value: formatBRL(openInvoicesTotal(d, today)), tone: "warn", icon: <CreditCard size={15} />, hint: `${m.cards.length} cartões` },
  };
  const order = normalizeOrder(d.settings.cardOrder).filter((k) => !d.settings.hiddenCards.includes(k));
  const highlight = (k: string) => (k === "networth" || k === "cash");

  return (
    <>
      <PageHeader
        title="Dashboard" description={`${monthLabel(cur)} · visão geral da sua vida financeira`}
        actions={<>
          <Segmented<Scope | "all"> value={scope} onChange={setScope} options={[{ value: "all", label: "Tudo" }, { value: "personal", label: "Pessoal" }, { value: "professional", label: "Profissional" }]} />
          <Button onClick={() => setCustom(true)}><SlidersHorizontal size={15} /><span className="hidden sm:inline">Personalizar</span></Button>
        </>}
      />
      <div className="space-y-6">
        <AvailableCard a={m.available} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {order.map((k) => <StatCard key={k} {...cardDefs[k]} className={cn(highlight(k) && "")} />)}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader title="Entradas x despesas" subtitle="Últimos 6 meses" /><IncomeExpenseChart data={m.series} /></Card>
          <Card>
            <CardHeader title="Evolução patrimonial" subtitle="Últimos 12 meses" action={<Link href="/patrimonio" className="text-xs font-medium text-brand hover:underline">Detalhes</Link>} />
            <AreaTrend data={m.hist.map((p) => ({ label: monthShortYear(p.month), value: p.net }))} color="invest" name="Patrimônio líquido" />
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Gastos por categoria" subtitle="Mês atual" />
            {donut.length === 0 ? <p className="py-10 text-center text-sm text-muted">Sem despesas no mês.</p> : (
              <div className="grid items-center gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Donut data={donut} center={<div><p className="num text-lg font-semibold">{formatBRL(total)}</p><p className="text-xs text-muted">no mês</p></div>} />
                <Legend2 items={donut.map((x) => ({ name: x.name, value: formatBRL(x.value), color: x.color, pct: formatPct((x.value / total) * 100, 0) }))} />
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Gastos fixos x variáveis" subtitle="Últimos 6 meses" />
            <StackedBars data={m.natureSeries} keys={[{ key: "fixed", label: "Fixos", color: c.info }, { key: "variable", label: "Variáveis", color: c.warn }, { key: "eventual", label: "Eventuais", color: c.invest }]} />
          </Card>
          <Card>
            <CardHeader title="Distribuição dos investimentos" subtitle={formatBRL(m.inv.current)} action={<Link href="/investimentos" className="text-xs font-medium text-brand hover:underline">Detalhes</Link>} />
            <Donut height={170} data={m.inv.allocation.map((a) => ({ name: a.label, value: a.value, color: a.color }))} />
            <div className="mt-3"><Legend2 items={m.inv.allocation.slice(0, 5).map((a) => ({ name: a.label, value: formatBRL(a.value), color: a.color, pct: formatPct(a.pct, 0) }))} /></div>
          </Card>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Upcoming />
          <div className="space-y-6">
            <Card>
              <CardHeader title="Evolução da reserva" subtitle={`${m.res.monthsCovered.toFixed(1).replace(".", ",")} meses de custo essencial`} action={<Link href="/reserva" className="text-xs font-medium text-brand hover:underline">Detalhes</Link>} />
              <AreaTrend height={160} color="info" name="Reserva" data={m.res.history.map((h) => ({ label: monthShort(h.month), value: h.balance }))} />
            </Card>
            <Card>
              <CardHeader title="Insights do momento" action={<Link href="/insights" className="text-xs font-medium text-brand hover:underline">Ver todos</Link>} />
              <ul className="space-y-2.5">
                {m.insights.map((i) => <li key={i.id} className="flex gap-2 text-sm"><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.tone === "positive" ? "bg-income" : i.tone === "negative" ? "bg-expense" : i.tone === "warning" ? "bg-warn" : "bg-info")} />{i.text}</li>)}
              </ul>
            </Card>
          </div>
        </div>
      </div>
      <CustomizeModal open={custom} onClose={() => setCustom(false)} />
    </>
  );
}
