"use client";
import { Download, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { AreaTrend, Donut, IncomeExpenseChart, Legend2 } from "@/components/charts/ChartKit";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, SelectInput, TextInput } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { useData, useToday } from "@/hooks/useStore";
import { buildReport, periodRange, type ReportPeriod } from "@/services/reports";
import { downloadText, toCSV } from "@/utils/csv";
import { formatDate, monthShort, monthShortYear } from "@/utils/date";
import { formatBRL, formatPct } from "@/utils/money";

export default function RelatoriosPage() {
  const d = useData();
  const today = useToday();
  const [kind, setKind] = useState<ReportPeriod>("month");
  const base = periodRange("month", today);
  const [custom, setCustom] = useState(base);
  const range = periodRange(kind, today, custom);
  const r = useMemo(() => buildReport(d, range.from, range.to, today), [d, range.from, range.to, today]);
  const total = r.categories.reduce((s, c) => s + c.total, 0);

  const exportCsv = () => downloadText(`relatorio-${r.from}-${r.to}.csv`, toCSV([
    ["Relatório", `${formatDate(r.from)} a ${formatDate(r.to)}`], [], ["Receitas", (r.income / 100).toFixed(2)], ["Despesas", (r.expense / 100).toFixed(2)], ["Resultado", (r.result / 100).toFixed(2)],
    ["Taxa de economia (%)", r.savingsRate.toFixed(1)], ["Investido", (r.invested / 100).toFixed(2)], [], ["Categoria", "Total"], ...r.categories.map((c) => [c.name, (c.total / 100).toFixed(2)]),
  ]));

  return (
    <>
      <PageHeader title="Relatórios" description={`${formatDate(r.from)} a ${formatDate(r.to)}`}
        actions={<><Button onClick={exportCsv}><Download size={15} />Excel (CSV)</Button><Button onClick={() => window.print()}><Printer size={15} />PDF / imprimir</Button></>} />
      <div className="no-print mb-6 flex flex-wrap items-end gap-3">
        <Field label="Período"><SelectInput value={kind} onChange={(e) => setKind(e.target.value as ReportPeriod)}>
          <option value="month">Mês atual</option><option value="quarter">Trimestre (3 meses)</option><option value="semester">Semestre (6 meses)</option><option value="year">Ano (12 meses)</option><option value="custom">Personalizado</option></SelectInput></Field>
        {kind === "custom" && <><Field label="De"><TextInput type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field><Field label="Até"><TextInput type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field></>}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["Receitas", formatBRL(r.income), "text-income"], ["Despesas", formatBRL(r.expense), "text-expense"], ["Resultado", formatBRL(r.result), r.result >= 0 ? "text-income" : "text-expense"], ["Taxa de economia", formatPct(r.savingsRate, 1), ""], ["Investido", formatBRL(r.invested), "text-invest"]].map(([l, v, c]) => (
          <Card key={l} className="!p-4"><p className="text-xs text-muted">{l}</p><p className={`num mt-1 text-lg font-semibold ${c}`}>{v}</p></Card>))}
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Receitas x despesas" /><IncomeExpenseChart data={r.series.map((s) => ({ label: monthShort(s.month), income: s.income, expense: s.expense }))} /></Card>
        <Card><CardHeader title="Despesas por categoria" />
          <div className="grid items-center gap-4 sm:grid-cols-2"><Donut height={200} data={r.categories.slice(0, 8).map((c) => ({ name: c.name, value: c.total, color: c.color }))} />
            <Legend2 items={r.categories.slice(0, 8).map((c) => ({ name: c.name, value: formatBRL(c.total), color: c.color, pct: formatPct(total ? (c.total / total) * 100 : 0, 0) }))} /></div></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Patrimônio" subtitle={`${formatBRL(r.netWorth.start)} → ${formatBRL(r.netWorth.end)}`} />
          {r.netWorth.points.length > 1 ? <AreaTrend height={170} color="invest" name="Patrimônio" data={r.netWorth.points.map((p) => ({ label: monthShortYear(p.month), value: p.net }))} /> : <p className="py-8 text-center text-sm text-muted">Sem histórico suficiente.</p>}</Card>
        <Card><CardHeader title="Cartões" /><ul className="space-y-2 text-sm">{r.cards.map((c) => <li key={c.card.id} className="flex justify-between"><span className="text-muted">{c.card.name}</span><span className="num font-medium">{formatBRL(c.spent)}</span></li>)}
          {r.cards.length === 0 && <li className="text-muted">Nenhum cartão.</li>}</ul></Card>
        <Card><CardHeader title="Assinaturas" /><p className="num text-xl font-semibold">{formatBRL(r.subscriptions.monthly)}<span className="text-sm font-normal text-muted"> /mês</span></p><p className="text-sm text-muted">{formatBRL(r.subscriptions.annual)} por ano em {r.subscriptions.count} serviços</p></Card>
      </div>
    </>
  );
}
