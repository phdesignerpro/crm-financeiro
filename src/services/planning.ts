import type { AppData, Cents, Goal, ISODate, InvestmentCategory, MonthKey } from "@/types";
import { addMonths, diffDays, lastMonths, monthEnd, monthOf, monthStart } from "@/utils/date";
import { INVESTMENT_COLOR, INVESTMENT_LABEL } from "@/utils/labels";
import { sum } from "@/utils/money";
import { allTransactions } from "./schedule";

/* ───────────── Reserva de emergência ───────────── */

export const RESERVE_OPTIONS = [3, 6, 9, 12] as const;

export interface EmergencyStatus {
  current: Cents;
  essential: Cents;
  targetMonths: number;
  target: Cents;
  pct: number;
  missing: Cents;
  monthsCovered: number;
  options: { months: number; amount: Cents }[];
  monthlyContribution: Cents;
  etaMonths: number | null;
  etaDate: ISODate | null;
  history: { month: MonthKey; balance: Cents }[];
}

export function emergencyStatus(d: AppData, today: ISODate): EmergencyStatus {
  const f = d.emergencyFund;
  const current = sum(d.emergencyEntries.map((e) => e.amount));
  const target = f.essentialMonthly * f.targetMonths;
  const missing = Math.max(0, target - current);
  const contribution = f.monthlyContribution;
  const etaMonths = missing === 0 ? 0 : contribution > 0 ? Math.ceil(missing / contribution) : null;
  const cur = monthOf(today);
  const history = lastMonths(cur, 12).map((m) => ({
    month: m,
    balance: sum(d.emergencyEntries.filter((e) => monthOf(e.date) <= m).map((e) => e.amount)),
  }));
  return {
    current, essential: f.essentialMonthly, targetMonths: f.targetMonths, target,
    pct: target ? Math.min(100, (current / target) * 100) : 0, missing,
    monthsCovered: f.essentialMonthly ? current / f.essentialMonthly : 0,
    options: RESERVE_OPTIONS.map((months) => ({ months, amount: f.essentialMonthly * months })),
    monthlyContribution: contribution, etaMonths, etaDate: etaMonths != null ? addMonths(today, etaMonths) : null, history,
  };
}

/** Custo essencial estimado a partir das categorias marcadas como essenciais (média de 3 meses). */
export function estimateEssentialMonthly(d: AppData, today: ISODate): Cents {
  const cur = monthOf(today);
  const months = lastMonths(cur, 4).slice(0, 3);
  const essentialIds = new Set(d.categories.filter((c) => c.essential).map((c) => c.id));
  const total = sum(
    d.transactions
      .filter((t) => t.kind === "expense" && t.status === "paid" && t.scope === "personal" && months.includes(monthOf(t.date)) && t.categoryId && essentialIds.has(t.categoryId))
      .map((t) => t.amount),
  );
  return Math.round(total / months.length);
}

/* ───────────── Metas ───────────── */

export interface GoalStatus {
  goal: Goal;
  pct: number;
  remaining: Cents;
  monthsLeft: number;
  requiredMonthly: Cents;
  etaMonths: number | null;
  status: "concluida" | "no_prazo" | "atrasada" | "sem_aporte";
}

export function goalStatus(g: Goal, today: ISODate): GoalStatus {
  const remaining = Math.max(0, g.target - g.current);
  const monthsLeft = Math.max(0, Math.ceil(diffDays(g.deadline, today) / 30.4375));
  const requiredMonthly = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;
  const etaMonths = remaining === 0 ? 0 : g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
  let status: GoalStatus["status"] = "no_prazo";
  if (remaining === 0) status = "concluida";
  else if (g.monthly === 0) status = "sem_aporte";
  else if (etaMonths! > monthsLeft) status = "atrasada";
  return { goal: g, pct: g.target ? Math.min(100, (g.current / g.target) * 100) : 0, remaining, monthsLeft, requiredMonthly, etaMonths, status };
}

/* ───────────── Investimentos ───────────── */

export interface Allocation { category: InvestmentCategory; label: string; color: string; value: Cents; pct: number }

export function investmentStats(d: AppData, month: MonthKey) {
  const applied = sum(d.investments.map((i) => i.appliedAmount));
  const current = sum(d.investments.map((i) => i.currentValue));
  const total = current || 1;
  const map = new Map<InvestmentCategory, Cents>();
  for (const i of d.investments) map.set(i.category, (map.get(i.category) ?? 0) + i.currentValue);
  const allocation: Allocation[] = [...map.entries()]
    .map(([category, value]) => ({ category, label: INVESTMENT_LABEL[category], color: INVESTMENT_COLOR[category], value, pct: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
  const monthAportes = sum(d.investmentTransactions.filter((t) => t.type === "aporte" && monthOf(t.date) === month).map((t) => t.amount));
  const gain = current - applied;
  return { applied, current, gain, returnPct: applied ? (gain / applied) * 100 : 0, monthAportes, allocation };
}

/* ───────────── Fixas x variáveis ───────────── */

export function fixedVariable(d: AppData, month: MonthKey, today: ISODate) {
  const txs = allTransactions(d, monthEnd(month)).filter(
    (t) => t.kind === "expense" && t.date >= monthStart(month) && t.date <= monthEnd(month),
  );
  const out = { fixed: 0, variable: 0, eventual: 0 };
  for (const t of txs) out[t.nature] += t.amount;
  const incomeReal = sum(d.transactions.filter((t) => t.kind === "income" && t.status === "paid" && monthOf(t.date) === month).map((t) => t.amount));
  const incomeExpected = sum(allTransactions(d, monthEnd(month)).filter((t) => t.kind === "income" && monthOf(t.date) === month).map((t) => t.amount));
  const income = Math.max(incomeReal, incomeExpected);
  return { ...out, income, fixedPct: income ? (out.fixed / income) * 100 : 0, month, today };
}
