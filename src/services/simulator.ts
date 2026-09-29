import type { AppData, Cents, ISODate } from "@/types";
import { addDays, addMonths } from "@/utils/date";
import { sum } from "@/utils/money";
import { projectCashflow, type Projection, type ProjectionOptions } from "./commitments";
import { netWorth } from "./networth";
import { emergencyStatus, goalStatus } from "./planning";

export interface Scenario {
  extraInvestMonthly: Cents;
  cutExpensesMonthly: Cents;
  extraIncomeMonthly: Cents;
  /** Compra/viagem/carro. */
  purchase: {
    amount: Cents;
    label: string;
    mode: "avista" | "financiado";
    downPayment: Cents;
    months: number;
    monthlyRatePct: number;
    /** Percentual do valor do bem mantido em 12 meses (0 = gasto sem bem, ex.: viagem). */
    retainedValuePct: number;
  };
  /** Rentabilidade anual hipotética dos aportes (apenas ilustrativa). */
  annualReturnPct: number;
}

export const emptyScenario = (): Scenario => ({
  extraInvestMonthly: 0, cutExpensesMonthly: 0, extraIncomeMonthly: 0,
  purchase: { amount: 0, label: "Compra", mode: "avista", downPayment: 0, months: 48, monthlyRatePct: 1.5, retainedValuePct: 0 },
  annualReturnPct: 8,
});

/** Parcela de financiamento (tabela Price). */
export function pmt(principal: Cents, monthlyRatePct: number, n: number): Cents {
  const i = monthlyRatePct / 100;
  if (n <= 0) return principal;
  if (i === 0) return Math.round(principal / n);
  return Math.round((principal * i) / (1 - Math.pow(1 + i, -n)));
}

export interface SimulationResult {
  base: Projection;
  scenario: Projection;
  financingMonthly: Cents;
  netWorth12: { base: Cents; scenario: Cents };
  balance12: { base: Cents; scenario: Cents };
  minBalance: { base: Cents; scenario: Cents; date: ISODate };
  reserveMonths: { base: number; scenario: number };
  deficit: Cents;
  monthlySurplus: { base: Cents; scenario: Cents };
  investedExtra12: Cents;
  investedExtraProjected: Cents;
  goals: { name: string; baseEta: number | null; requiredMonthly: Cents; fits: boolean }[];
  verdict: "ok" | "warn" | "bad";
  notes: string[];
}

function toOptions(s: Scenario, today: ISODate): ProjectionOptions {
  const p = s.purchase;
  const opts: ProjectionOptions = {
    extraIncomeMonthly: s.extraIncomeMonthly, cutExpensesMonthly: s.cutExpensesMonthly, extraInvestMonthly: s.extraInvestMonthly,
  };
  if (p.amount > 0) {
    if (p.mode === "avista") opts.oneOffs = [{ amount: p.amount, date: addDays(today, 1), label: p.label }];
    else {
      const financed = Math.max(0, p.amount - p.downPayment);
      opts.oneOffs = p.downPayment > 0 ? [{ amount: p.downPayment, date: addDays(today, 1), label: `Entrada — ${p.label}` }] : [];
      opts.financing = { monthly: pmt(financed, p.monthlyRatePct, p.months), months: p.months, label: `Parcela — ${p.label}` };
    }
  }
  return opts;
}

export function simulate(d: AppData, today: ISODate, s: Scenario): SimulationResult {
  const base = projectCashflow(d, today, 365);
  const opts = toOptions(s, today);
  const scen = projectCashflow(d, today, 365, opts);
  const nw0 = netWorth(d, today).net;

  // patrimônio em 12 meses: resultado operacional acumulado (aportes continuam como patrimônio)
  const operating = (p: Projection) => sum(p.monthly.map((r) => r.income - r.bills - r.invoices - r.variable));
  const p = s.purchase;
  const retained = Math.round((p.amount * p.retainedValuePct) / 100);
  const investedExtra12 = s.extraInvestMonthly * 12;
  const r = Math.pow(1 + s.annualReturnPct / 100, 1 / 12) - 1;
  let projected = 0;
  for (let i = 0; i < 12; i++) projected = (projected + s.extraInvestMonthly) * (1 + r);

  const nwBase = nw0 + operating(base);
  // operating(scen) já desconta o desembolso de caixa da compra (bills); o bem adquirido entra como ativo (retained).
  const nwScen = nw0 + operating(scen) + retained + Math.round(projected - investedExtra12);

  const res = emergencyStatus(d, today);
  const deficit = Math.max(0, -scen.minBalance);
  const reserveBase = res.essential ? res.current / res.essential : 0;
  const reserveScen = res.essential ? Math.max(0, res.current - deficit) / res.essential : 0;

  const surplus = (pr: Projection) => Math.round(sum(pr.monthly.map((r2) => r2.income - r2.bills - r2.invoices - r2.variable)) / Math.max(1, pr.monthly.length));
  const surplusScen = surplus(scen);
  const commitmentsMonthly = d.settings.monthlyInvestmentPlan + d.emergencyFund.monthlyContribution + s.extraInvestMonthly;

  const goals = d.goals.map((g) => {
    const st = goalStatus(g, today);
    return { name: g.name, baseEta: st.etaMonths, requiredMonthly: st.requiredMonthly, fits: true };
  });
  const goalsMonthly = sum(d.goals.filter((g) => g.current < g.target).map((g) => g.monthly));
  const fitsAll = surplusScen >= commitmentsMonthly + goalsMonthly;
  goals.forEach((g) => (g.fits = fitsAll));

  const notes: string[] = [];
  if (scen.minBalance < 0) notes.push(`O saldo ficaria negativo em ${scen.minDate.split("-").reverse().join("/")} (mínimo de ${(scen.minBalance / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Você precisaria usar a reserva ou reduzir gastos.`);
  if (!fitsAll) notes.push("A sobra mensal projetada não cobre todos os aportes planejados (investimentos, reserva e metas): alguma meta atrasaria.");
  if (p.amount > 0 && p.mode === "financiado") notes.push(`A parcela de ${(pmt(Math.max(0, p.amount - p.downPayment), p.monthlyRatePct, p.months) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} durante ${p.months} meses reduz sua sobra mensal na mesma proporção.`);
  if (s.extraInvestMonthly > 0) notes.push("A projeção dos aportes usa uma rentabilidade hipotética informada por você: não é garantia nem recomendação de produto.");

  const verdict: SimulationResult["verdict"] = scen.minBalance < 0 ? "bad" : !fitsAll || scen.minBalance < d.emergencyFund.essentialMonthly / 3 ? "warn" : "ok";
  return {
    base, scenario: scen, financingMonthly: opts.financing?.monthly ?? 0,
    netWorth12: { base: nwBase, scenario: nwScen }, balance12: { base: base.endBalance, scenario: scen.endBalance },
    minBalance: { base: base.minBalance, scenario: scen.minBalance, date: scen.minDate },
    reserveMonths: { base: reserveBase, scenario: reserveScen }, deficit, monthlySurplus: { base: surplus(base), scenario: surplusScen },
    investedExtra12, investedExtraProjected: Math.round(projected), goals, verdict, notes,
  };
}

export { addMonths };
