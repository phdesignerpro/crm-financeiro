"use client";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AreaTrend, StackedBars, useChartColors } from "@/components/charts/ChartKit";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, EmptyState, ProgressBar } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { CAL_COLOR, CAL_LABEL, calendarEvents, type CalKind } from "@/services/calendar";
import { projectCashflow } from "@/services/commitments";
import { budgetStatuses } from "@/services/finance";
import { fixedVariable } from "@/services/planning";
import type { Budget } from "@/types";
import { cn } from "@/utils/cn";
import { addMonthsKey, daysInMonth, formatDate, formatDateShort, lastMonths, monthLabel, monthOf, monthShort, monthShortYear, WEEKDAYS, fromISO } from "@/utils/date";
import { uid } from "@/utils/id";
import { formatBRL, formatPct, sum } from "@/utils/money";
import { spendingByNature } from "@/services/finance";

type Tab = "orcamento" | "fluxo" | "calendario" | "fixas";

export default function PlanejamentoPage() {
  const [tab, setTab] = useState<Tab>("orcamento");
  return (
    <>
      <PageHeader title="Planejamento" description="Orçamento mensal, fluxo de caixa futuro, calendário financeiro e custos fixos." />
      <Tabs className="mb-6" value={tab} onChange={setTab} items={[{ id: "orcamento", label: "Orçamento" }, { id: "fluxo", label: "Fluxo de caixa" }, { id: "calendario", label: "Calendário" }, { id: "fixas", label: "Fixas x variáveis" }]} />
      {tab === "orcamento" && <Budgets />}
      {tab === "fluxo" && <Cashflow />}
      {tab === "calendario" && <Calendar />}
      {tab === "fixas" && <FixedVariable />}
    </>
  );
}

function Budgets() {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const confirm = useConfirm();
  const cur = monthOf(today);
  const [editing, setEditing] = useState<Partial<Budget> | null>(null);
  const st = useMemo(() => budgetStatuses(d, cur), [d, cur]);
  const totalLimit = sum(st.map((s) => s.limit));
  const totalSpent = sum(st.map((s) => s.spent));
  const used = d.budgets.map((b) => b.categoryId);
  const fields: FieldDef[] = [
    { name: "categoryId", label: "Categoria", type: "select", required: true, options: d.categories.filter((c) => !c.parentId && c.kind === "expense" && (!used.includes(c.id) || c.id === editing?.categoryId)).map((c) => ({ value: c.id, label: c.name })) },
    { name: "amount", label: "Orçamento mensal", type: "money", required: true },
  ];
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="!p-4"><p className="text-xs text-muted">Orçado no mês</p><p className="num mt-1 text-xl font-semibold">{formatBRL(totalLimit)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Gasto nas categorias orçadas</p><p className="num mt-1 text-xl font-semibold">{formatBRL(totalSpent)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Restante</p><p className={cn("num mt-1 text-xl font-semibold", totalLimit - totalSpent < 0 ? "text-expense" : "text-income")}>{formatBRL(totalLimit - totalSpent)}</p></Card>
      </div>
      <Card>
        <CardHeader title={`Orçamento de ${monthLabel(cur)}`} subtitle="Alertas em 70%, 90% e 100% do limite (despesas pessoais)" action={<Button size="sm" variant="primary" onClick={() => setEditing({})}><Plus size={14} />Categoria</Button>} />
        {st.length === 0 ? <EmptyState title="Nenhum orçamento definido" /> : (
          <ul className="space-y-5">{st.map((s) => (
            <li key={s.budgetId}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{s.category.name}</p>
                <div className="flex items-center gap-2">
                  {s.level !== "ok" && <Badge tone={s.level === "70" ? "warn" : "expense"}>{s.level === "100" ? "Estourado" : s.level === "90" ? "Crítico (≥90%)" : "Atenção (≥70%)"}</Badge>}
                  <IconButton label="Editar orçamento" onClick={() => setEditing(d.budgets.find((b) => b.id === s.budgetId)!)}><Pencil size={14} /></IconButton>
                  <IconButton label="Excluir orçamento" onClick={async () => { if (await confirm({ title: "Excluir orçamento?", message: s.category.name, danger: true, confirmLabel: "Excluir" })) a.remove("budgets", s.budgetId); }}><Trash2 size={14} /></IconButton>
                </div>
              </div>
              <ProgressBar value={s.pct} tone={s.pct >= 90 ? "expense" : s.pct >= 70 ? "warn" : "income"} label={`Uso do orçamento de ${s.category.name}`} />
              <p className="mt-1 text-xs text-muted"><span className="num">{formatBRL(s.spent)}</span> / <span className="num">{formatBRL(s.limit)}</span> · {formatPct(s.pct, 0)} utilizado{s.limit - s.spent > 0 ? ` · restam ${formatBRL(s.limit - s.spent)}` : ` · excedeu ${formatBRL(s.spent - s.limit)}`}</p>
            </li>))}</ul>
        )}
      </Card>
      <FormModal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar orçamento" : "Novo orçamento"} fields={fields} initial={{ categoryId: "", amount: 0, ...editing }}
        onSubmit={(v) => { a.add("budgets", { ...editing, ...(v as Partial<Budget>), id: editing?.id ?? uid() } as Budget); setEditing(null); }} />
    </>
  );
}

function Cashflow() {
  const d = useData();
  const today = useToday();
  const [range, setRange] = useState<"30" | "90" | "180" | "365">("90");
  const p = useMemo(() => projectCashflow(d, today, Number(range)), [d, today, range]);
  const series = range === "30" ? p.daily.map((x) => ({ label: formatDateShort(x.date), value: x.balance })) : p.monthly.map((m) => ({ label: monthShortYear(m.month), value: m.closing }));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={range} onChange={setRange} items={[{ id: "30", label: "30 dias" }, { id: "90", label: "3 meses" }, { id: "180", label: "6 meses" }, { id: "365", label: "12 meses" }]} />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card className="!p-4"><p className="text-xs text-muted">Saldo hoje</p><p className="num mt-1 text-xl font-semibold">{formatBRL(p.start)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Saldo projetado</p><p className={cn("num mt-1 text-xl font-semibold", p.endBalance < 0 ? "text-expense" : "text-info")}>{formatBRL(p.endBalance)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Menor saldo</p><p className={cn("num mt-1 text-xl font-semibold", p.minBalance < 0 ? "text-expense" : "")}>{formatBRL(p.minBalance)}</p><p className="text-xs text-muted">em {formatDate(p.minDate)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Sobra média mensal</p><p className="num mt-1 text-xl font-semibold">{formatBRL(p.avgMonthlyNet)}</p></Card>
      </div>
      <Card className="mb-6"><CardHeader title="Saldo projetado" subtitle="Contas correntes e carteiras (sem investimentos)" /><AreaTrend data={series} color="info" name="Saldo" zeroLine height={280} /></Card>
      <Card pad={false}><div className="overflow-x-auto"><table className="w-full min-w-[720px]">
        <thead><tr className="border-b border-line bg-surface-2/50"><th className="th">Mês</th><th className="th text-right">Entradas</th><th className="th text-right">Contas</th><th className="th text-right">Faturas</th><th className="th text-right">Variáveis (est.)</th><th className="th text-right">Aportes</th><th className="th text-right">Saldo final</th></tr></thead>
        <tbody className="divide-y divide-line">{p.monthly.map((r) => (
          <tr key={r.month}><td className="td font-medium">{monthLabel(r.month)}</td><td className="td num text-right text-income">{formatBRL(r.income)}</td><td className="td num text-right">{formatBRL(r.bills)}</td>
            <td className="td num text-right">{formatBRL(r.invoices)}</td><td className="td num text-right text-muted">{formatBRL(r.variable)}</td><td className="td num text-right text-invest">{formatBRL(r.invest + r.reserve + r.goals)}</td>
            <td className={cn("td num text-right font-semibold", r.closing < 0 && "text-expense")}>{formatBRL(r.closing)}</td></tr>))}</tbody></table></div></Card>
      <p className="mt-3 text-xs text-muted">Considera receitas recorrentes e mensalidades de clientes, contas, assinaturas, parcelas, faturas, aportes planejados (investimentos, reserva e metas) e gastos variáveis pela média dos últimos 3 meses. Receitas avulsas futuras e cobranças em atraso não são previstas.</p>
    </>
  );
}

function Calendar() {
  const d = useData();
  const today = useToday();
  const [month, setMonth] = useState(monthOf(today));
  const [selDay, setSelDay] = useState<string | null>(null);
  const events = useMemo(() => calendarEvents(d, month, today), [d, month, today]);
  const [y, m] = month.split("-").map(Number);
  const offset = fromISO(`${month}-01`).getDay();
  const days = daysInMonth(y, m);
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const byDay = (n: number) => events.filter((e) => Number(e.date.slice(8)) === n);
  const list = selDay ? events.filter((e) => e.date === selDay) : events;
  const totals = (k: CalKind) => sum(events.filter((e) => e.kind === k).map((e) => e.amount));

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{monthLabel(month)}</h3>
          <div className="flex gap-1"><IconButton label="Mês anterior" onClick={() => setMonth(addMonthsKey(month, -1))}><ChevronLeft size={18} /></IconButton>
            <Button size="sm" onClick={() => setMonth(monthOf(today))}>Hoje</Button>
            <IconButton label="Próximo mês" onClick={() => setMonth(addMonthsKey(month, 1))}><ChevronRight size={18} /></IconButton></div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">{WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((n, i) => {
            if (n == null) return <div key={i} />;
            const iso = `${month}-${String(n).padStart(2, "0")}`;
            const ev = byDay(n);
            const kinds = [...new Set(ev.map((e) => e.kind))];
            return (
              <button key={i} type="button" onClick={() => setSelDay(selDay === iso ? null : iso)} aria-label={`Dia ${n}, ${ev.length} eventos`}
                className={cn("flex min-h-[64px] flex-col items-start rounded-lg border border-line p-1.5 text-left transition hover:bg-surface-2 sm:min-h-[84px]", iso === today && "border-brand bg-brand/5", selDay === iso && "ring-2 ring-brand/40")}>
                <span className={cn("text-xs font-medium", iso === today && "text-brand")}>{n}</span>
                <div className="mt-auto flex flex-wrap gap-0.5">{kinds.map((k) => <span key={k} className={cn("h-1.5 w-1.5 rounded-full", CAL_COLOR[k])} />)}</div>
                {ev.length > 0 && <span className="mt-0.5 hidden text-[10px] text-muted sm:block">{ev.length} {ev.length === 1 ? "item" : "itens"}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{(Object.keys(CAL_LABEL) as CalKind[]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", CAL_COLOR[k])} />{CAL_LABEL[k]}</span>)}</div>
      </Card>
      <Card pad={false}>
        <div className="p-5 pb-2"><CardHeader title={selDay ? formatDate(selDay) : "Eventos do mês"} subtitle={selDay ? "Clique novamente no dia para ver o mês todo" : `Entradas ${formatBRL(totals("in") + totals("pro"))} · Saídas ${formatBRL(totals("out") + totals("card"))}`} /></div>
        {list.length === 0 ? <EmptyState title="Sem eventos" /> : (
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">{list.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-5 py-2.5"><span className={cn("h-2 w-2 shrink-0 rounded-full", CAL_COLOR[e.kind])} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{e.label}</p><p className="text-xs text-muted">{formatDateShort(e.date)} · {CAL_LABEL[e.kind]}{e.done ? " · realizado" : " · previsto"}</p></div>
              <span className={cn("num text-sm font-medium", (e.kind === "in" || e.kind === "pro") ? "text-income" : "")}>{formatBRL(e.amount)}</span></li>))}</ul>)}
      </Card>
    </div>
  );
}

function FixedVariable() {
  const d = useData();
  const today = useToday();
  const c = useChartColors();
  const cur = monthOf(today);
  const fv = useMemo(() => fixedVariable(d, cur, today), [d, cur, today]);
  const total = fv.fixed + fv.variable + fv.eventual;
  const series = lastMonths(cur, 6).map((m) => ({ label: monthShort(m), ...spendingByNature(d, m) }));
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card className="!p-4"><p className="text-xs text-muted">Gastos fixos mensais</p><p className="num mt-1 text-xl font-semibold text-info">{formatBRL(fv.fixed)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Gastos variáveis</p><p className="num mt-1 text-xl font-semibold text-warn">{formatBRL(fv.variable)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Eventuais</p><p className="num mt-1 text-xl font-semibold text-invest">{formatBRL(fv.eventual)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Renda comprometida com fixos</p><p className={cn("num mt-1 text-xl font-semibold", fv.fixedPct > 65 ? "text-expense" : fv.fixedPct > 50 ? "text-warn" : "text-income")}>{formatPct(fv.fixedPct, 0)}</p></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Fixos x variáveis x eventuais" subtitle="Realizado por mês" /><StackedBars data={series} keys={[{ key: "fixed", label: "Fixos", color: c.info }, { key: "variable", label: "Variáveis", color: c.warn }, { key: "eventual", label: "Eventuais", color: c.invest }]} /></Card>
        <Card><CardHeader title="Composição do mês" subtitle="Inclui compromissos previstos até o fim do mês" />
          {[["Fixas", fv.fixed, "info"], ["Variáveis", fv.variable, "warn"], ["Eventuais", fv.eventual, "invest"]].map(([l, v, t]) => (
            <div key={l as string} className="mb-4"><div className="mb-1 flex justify-between text-sm"><span>{l as string}</span><span className="num text-muted">{formatBRL(v as number)} · {formatPct(total ? ((v as number) / total) * 100 : 0, 0)}</span></div>
              <ProgressBar value={total ? ((v as number) / total) * 100 : 0} tone={t as "info" | "warn" | "invest"} /></div>))}
          <p className="text-xs text-muted">Renda considerada: {formatBRL(fv.income)}. Altere a classificação (fixa, variável ou eventual) em cada categoria ou movimentação.</p></Card>
      </div>
    </>
  );
}
