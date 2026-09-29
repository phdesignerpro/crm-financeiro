"use client";
import { useMemo, useState } from "react";
import { AreaTrend } from "@/components/charts/ChartKit";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Feedback";
import { Field, MoneyInput, Segmented, TextInput } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { useData, useToday } from "@/hooks/useStore";
import { emptyScenario, simulate, type Scenario } from "@/services/simulator";
import { formatDate, monthShortYear } from "@/utils/date";
import { formatBRL } from "@/utils/money";
import { cn } from "@/utils/cn";

const PRESETS: { label: string; apply: (s: Scenario) => Scenario }[] = [
  { label: "Investir R$ 2.000/mês", apply: (s) => ({ ...s, extraInvestMonthly: 200000 }) },
  { label: "Reduzir R$ 500 de gastos", apply: (s) => ({ ...s, cutExpensesMonthly: 50000 }) },
  { label: "Renda +R$ 2.000", apply: (s) => ({ ...s, extraIncomeMonthly: 200000 }) },
  { label: "Comprar carro de R$ 70.000", apply: (s) => ({ ...s, purchase: { amount: 7000000, label: "Carro", mode: "financiado", downPayment: 1400000, months: 48, monthlyRatePct: 1.5, retainedValuePct: 85 } }) },
  { label: "Viagem de R$ 10.000", apply: (s) => ({ ...s, purchase: { ...s.purchase, amount: 1000000, label: "Viagem", mode: "avista", retainedValuePct: 0 } }) },
];

export default function SimuladorPage() {
  const d = useData();
  const today = useToday();
  const [s, setS] = useState<Scenario>(emptyScenario());
  const r = useMemo(() => simulate(d, today, s), [d, today, s]);
  const set = (p: Partial<Scenario>) => setS((c) => ({ ...c, ...p }));
  const setP = (p: Partial<Scenario["purchase"]>) => setS((c) => ({ ...c, purchase: { ...c.purchase, ...p } }));
  const chart = r.base.monthly.map((m, i) => ({ label: monthShortYear(m.month), base: m.closing, sim: r.scenario.monthly[i]?.closing ?? 0 }));
  const delta = (a: number, b: number) => { const x = b - a; return <span className={cn("num text-xs", x >= 0 ? "text-income" : "text-expense")}>{x >= 0 ? "+" : "−"}{formatBRL(Math.abs(x))}</span>; };
  const changed = JSON.stringify(s) !== JSON.stringify(emptyScenario());

  return (
    <>
      <PageHeader title="Simulador “E se?”" description="Teste cenários sem alterar seus dados reais. Nada aqui é salvo."
        actions={<Button onClick={() => setS(emptyScenario())} disabled={!changed}>Limpar cenário</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">{PRESETS.map((p) => <button key={p.label} type="button" onClick={() => setS(p.apply(emptyScenario()))} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-fg">E se… {p.label}</button>)}</div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card><CardHeader title="Ajustes mensais" />
            <div className="space-y-3">
              <Field label="Investir por mês"><MoneyInput value={s.extraInvestMonthly || null} onChange={(v) => set({ extraInvestMonthly: v ?? 0 })} /></Field>
              <Field label="Reduzir gastos por mês"><MoneyInput value={s.cutExpensesMonthly || null} onChange={(v) => set({ cutExpensesMonthly: v ?? 0 })} /></Field>
              <Field label="Renda adicional por mês"><MoneyInput value={s.extraIncomeMonthly || null} onChange={(v) => set({ extraIncomeMonthly: v ?? 0 })} /></Field>
              <Field label="Rentabilidade anual hipotética dos aportes (%)" hint="Apenas ilustrativa; não é garantia."><TextInput type="number" min={0} max={50} value={s.annualReturnPct} onChange={(e) => set({ annualReturnPct: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            </div></Card>
          <Card><CardHeader title="Compra ou viagem" />
            <div className="space-y-3">
              <Field label="Descrição"><TextInput value={s.purchase.label} onChange={(e) => setP({ label: e.target.value })} /></Field>
              <Field label="Valor"><MoneyInput value={s.purchase.amount || null} onChange={(v) => setP({ amount: v ?? 0 })} /></Field>
              <Segmented value={s.purchase.mode} onChange={(v) => setP({ mode: v })} options={[{ value: "avista", label: "À vista" }, { value: "financiado", label: "Financiado" }]} />
              {s.purchase.mode === "financiado" && (<>
                <Field label="Entrada"><MoneyInput value={s.purchase.downPayment || null} onChange={(v) => setP({ downPayment: v ?? 0 })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Parcelas"><TextInput type="number" min={1} max={120} value={s.purchase.months} onChange={(e) => setP({ months: Math.max(1, Number(e.target.value) || 1) })} /></Field>
                  <Field label="Juros (% a.m.)"><TextInput type="number" min={0} step={0.1} value={s.purchase.monthlyRatePct} onChange={(e) => setP({ monthlyRatePct: Math.max(0, Number(e.target.value) || 0) })} /></Field></div>
              </>)}
              <Field label="Valor do bem mantido em 12 meses (%)" hint="0% para viagens; ~85% para um carro."><TextInput type="number" min={0} max={100} value={s.purchase.retainedValuePct} onChange={(e) => setP({ retainedValuePct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></Field>
            </div></Card>
        </div>

        <div className="space-y-6">
          <Card className={cn("!p-4", r.verdict === "bad" && "border-expense/40", r.verdict === "warn" && "border-warn/40")}>
            <div className="flex items-center gap-2"><Badge tone={r.verdict === "ok" ? "income" : r.verdict === "warn" ? "warn" : "expense"}>{r.verdict === "ok" ? "Cenário viável" : r.verdict === "warn" ? "Viável com atenção" : "Cenário compromete o caixa"}</Badge>
              {!changed && <span className="text-xs text-muted">Ajuste os valores ao lado para simular.</span>}</div>
            {r.notes.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          </Card>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {[
              ["Saldo em 12 meses", r.balance12.base, r.balance12.scenario], ["Patrimônio em 12 meses", r.netWorth12.base, r.netWorth12.scenario],
              ["Menor saldo no período", r.minBalance.base, r.minBalance.scenario], ["Sobra mensal média", r.monthlySurplus.base, r.monthlySurplus.scenario],
            ].map(([l, b, sc]) => (
              <Card key={l as string} className="!p-4"><p className="text-xs text-muted">{l as string}</p><p className={cn("num mt-1 text-lg font-semibold", (sc as number) < 0 && "text-expense")}>{formatBRL(sc as number)}</p>
                <p className="text-xs text-muted">Atual: {formatBRL(b as number)} {delta(b as number, sc as number)}</p></Card>))}
            <Card className="!p-4"><p className="text-xs text-muted">Reserva (meses de custo essencial)</p><p className="num mt-1 text-lg font-semibold">{r.reserveMonths.scenario.toFixed(1).replace(".", ",")}</p><p className="text-xs text-muted">Atual: {r.reserveMonths.base.toFixed(1).replace(".", ",")}{r.deficit > 0 && ` · déficit de ${formatBRL(r.deficit)}`}</p></Card>
            <Card className="!p-4"><p className="text-xs text-muted">Investimentos adicionais em 12 meses</p><p className="num mt-1 text-lg font-semibold text-invest">{formatBRL(r.investedExtra12)}</p><p className="text-xs text-muted">Com a rentabilidade hipotética: {formatBRL(r.investedExtraProjected)}</p></Card>
          </div>
          <Card><CardHeader title="Fluxo de caixa: atual x cenário" subtitle={`Menor saldo do cenário: ${formatBRL(r.minBalance.scenario)} em ${formatDate(r.minBalance.date)}`} />
            <AreaTrend color="info" height={260} name="Cenário" zeroLine data={chart.map((c) => ({ label: c.label, value: c.sim }))} />
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">{chart.map((c) => <li key={c.label} className="flex justify-between text-muted"><span>{c.label}</span><span className="num text-fg">{formatBRL(c.sim)}</span></li>)}</ul></Card>
          <Card><CardHeader title="Metas" subtitle="Cabem no cenário?" />
            <ul className="divide-y divide-line">{r.goals.map((g) => (<li key={g.name} className="flex items-center justify-between py-2 text-sm"><span>{g.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted">{g.baseEta != null ? `~${g.baseEta} meses no ritmo atual` : "sem aporte"}<Badge tone={g.fits ? "income" : "warn"}>{g.fits ? "Cabe" : "Pode atrasar"}</Badge></span></li>))}</ul></Card>
        </div>
      </div>
    </>
  );
}
