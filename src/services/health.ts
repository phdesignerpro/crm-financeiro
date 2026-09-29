import type { AppData, ISODate } from "@/types";
import { addMonthsKey, lastMonths, monthEnd, monthOf, monthStart } from "@/utils/date";
import { formatPct } from "@/utils/money";
import { sum } from "@/utils/money";
import { allCardSummaries, spendingByCategory } from "./finance";
import { netWorthChange } from "./networth";
import { emergencyStatus } from "./planning";
import { allTransactions } from "./schedule";

export type HealthStatus = "good" | "warn" | "bad" | "neutral";

export interface Indicator {
  id: string;
  label: string;
  display: string;
  value: number;
  status: HealthStatus;
  meaning: string;
  reference: string;
}

const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
const grade = (v: number, good: number, warn: number, higherIsBetter: boolean): HealthStatus =>
  higherIsBetter ? (v >= good ? "good" : v >= warn ? "warn" : "bad") : v <= good ? "good" : v <= warn ? "warn" : "bad";

/** Indicadores calculados sobre a média dos 3 últimos meses fechados (e posição atual quando fizer sentido). */
export function healthIndicators(d: AppData, today: ISODate): Indicator[] {
  const cur = monthOf(today);
  const months = lastMonths(addMonthsKey(cur, -1), 3);
  const inMonths = (dt: string) => months.includes(monthOf(dt));
  const paid = d.transactions.filter((t) => t.status === "paid" && inMonths(t.date));
  const income = sum(paid.filter((t) => t.kind === "income").map((t) => t.amount));
  const expenses = paid.filter((t) => t.kind === "expense");
  const expense = sum(expenses.map((t) => t.amount));
  const fixed = sum(expenses.filter((t) => t.nature === "fixed").map((t) => t.amount));
  const cardSpend = sum(expenses.filter((t) => t.cardId).map((t) => t.amount));
  const invested = sum(d.investmentTransactions.filter((t) => t.type === "aporte" && inMonths(t.date)).map((t) => t.amount));

  const savings = rate(income - expense, income);
  const fixedRatio = rate(fixed, income);
  const expenseRatio = rate(expense, income);

  const monthlyIncome = income / months.length;
  const installmentsMonthly = sum(
    allTransactions(d, monthEnd(cur)).filter((t) => t.installmentId && t.kind === "expense" && monthOf(t.date) === cur).map((t) => t.amount),
  );
  const debtMonthly = sum(d.liabilities.map((l) => l.monthlyPayment)) + installmentsMonthly;
  const debtRatio = rate(debtMonthly, monthlyIncome);

  const reserve = emergencyStatus(d, today);
  const cards = allCardSummaries(d, today);
  const limit = sum(cards.map((c) => c.card.limit));
  const used = sum(cards.map((c) => c.used));
  const utilization = rate(used, limit);
  const cardIncomePct = rate(cardSpend, income);

  const nw = netWorthChange(d, today, 6);
  const investedPct = rate(invested, income);

  const prevExp = (m: string) => sum(d.transactions.filter((t) => t.kind === "expense" && t.status === "paid" && monthOf(t.date) === m).map((t) => t.amount));
  const lastMonth = addMonthsKey(cur, -1);
  const prior = [addMonthsKey(cur, -2), addMonthsKey(cur, -3), addMonthsKey(cur, -4)];
  const priorAvg = sum(prior.map(prevExp)) / prior.length;
  const growth = priorAvg > 0 ? ((prevExp(lastMonth) - priorAvg) / priorAvg) * 100 : 0;

  const spend = spendingByCategory(d, monthStart(months[0]), monthEnd(months[months.length - 1]));
  const total = sum(spend.map((s) => s.total));
  const top3 = rate(sum(spend.slice(0, 3).map((s) => s.total)), total);
  const top = spend[0];
  const topPct = rate(top?.total ?? 0, total);

  return [
    { id: "savings", label: "Taxa de economia", display: formatPct(savings, 0), value: savings, status: grade(savings, 20, 10, true),
      meaning: "Quanto da sua renda sobra depois de pagar todas as despesas. É o principal motor do crescimento patrimonial.",
      reference: "Saudável: acima de 20%. Atenção: entre 10% e 20%." },
    { id: "fixed", label: "Despesas fixas / renda", display: `${formatPct(fixedRatio, 0)} da renda`, value: fixedRatio, status: grade(fixedRatio, 50, 65, false),
      meaning: "Parte da renda já comprometida todo mês com custos que você não consegue cortar rápido (aluguel, planos, financiamentos).",
      reference: "Saudável: até 50%. Acima de 65% reduz muito a flexibilidade." },
    { id: "expenses", label: "Despesas totais / renda", display: `${formatPct(expenseRatio, 0)} da renda`, value: expenseRatio, status: grade(expenseRatio, 80, 95, false),
      meaning: "Quanto da renda é consumido por gastos. Perto de 100% significa que quase nada sobra para guardar.",
      reference: "Saudável: até 80%." },
    { id: "debt", label: "Dívida / renda", display: `${formatPct(debtRatio, 0)} da renda`, value: debtRatio, status: grade(debtRatio, 20, 35, false),
      meaning: "Parcelas de financiamentos, dívidas e compras parceladas do mês em relação à renda mensal.",
      reference: "Saudável: até 20%. Acima de 35% costuma pressionar o caixa." },
    { id: "reserve", label: "Reserva de emergência", display: `${reserve.monthsCovered.toFixed(1).replace(".", ",")} meses`, value: reserve.monthsCovered,
      status: grade(reserve.monthsCovered, 6, 3, true),
      meaning: "Por quantos meses você mantém seu custo essencial sem nenhuma renda.",
      reference: "Saudável: 6 meses ou mais. Mínimo recomendado: 3 meses." },
    { id: "cards", label: "Utilização dos cartões", display: `${formatPct(utilization, 0)} do limite`, value: utilization, status: grade(utilization, 30, 50, false),
      meaning: `Limite consumido por faturas e parcelas. Os gastos no cartão representam ${formatPct(cardIncomePct, 0)} da renda.`,
      reference: "Saudável: até 30% do limite total." },
    { id: "networth", label: "Evolução patrimonial", display: nw.from ? `${nw.delta >= 0 ? "+" : "−"} R$ ${Math.abs(Math.round(nw.delta / 100)).toLocaleString("pt-BR")}` : "—", value: nw.delta,
      status: nw.from ? (nw.delta > 0 ? "good" : nw.delta === 0 ? "warn" : "bad") : "neutral",
      meaning: "Variação do patrimônio líquido nos últimos 6 meses (ativos menos passivos).",
      reference: "Saudável: patrimônio crescendo de forma consistente." },
    { id: "invested", label: "Investido da renda", display: `${formatPct(investedPct, 0)} da renda`, value: investedPct, status: grade(investedPct, 15, 5, true),
      meaning: "Percentual da renda destinado a aportes em investimentos.",
      reference: "Referência comum: 10% a 20%, conforme seus objetivos." },
    { id: "growth", label: "Crescimento dos gastos", display: `${growth > 0 ? "+" : ""}${formatPct(growth, 1)}`, value: growth, status: grade(growth, 5, 15, false),
      meaning: "Variação das despesas do último mês fechado contra a média dos 3 meses anteriores.",
      reference: "Saudável: variação de até 5%." },
    { id: "concentration", label: "Concentração de despesas", display: top ? `${top.name}: ${formatPct(topPct, 0)}` : "—", value: top3, status: top ? grade(top3, 60, 75, false) : "neutral",
      meaning: `As 3 maiores categorias somam ${formatPct(top3, 0)} dos gastos. Concentração alta indica onde um ajuste tem mais efeito.`,
      reference: "Atenção quando 3 categorias passam de 75% dos gastos." },
  ];
}

export function healthSummary(indicators: Indicator[]) {
  const scored = indicators.filter((i) => i.status !== "neutral");
  return {
    good: scored.filter((i) => i.status === "good").length,
    warn: scored.filter((i) => i.status === "warn").length,
    bad: scored.filter((i) => i.status === "bad").length,
    total: scored.length,
  };
}
