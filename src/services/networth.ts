import type { AppData, Cents, ISODate, MonthKey } from "@/types";
import { addMonthsKey, lastMonths, monthOf } from "@/utils/date";
import { sum } from "@/utils/money";
import { activeAccounts, accountBalance, allCardSummaries } from "./finance";

export interface NetWorth {
  assets: { cash: Cents; investments: Cents; property: Cents; vehicles: Cents; other: Cents; receivables: Cents };
  liabilities: { financing: Cents; loans: Cents; debts: Cents; cards: Cents; payable: Cents };
  totalAssets: Cents;
  totalLiabilities: Cents;
  net: Cents;
}

export function pendingReceivables(d: AppData): Cents {
  return sum(d.professionalIncome.filter((p) => p.status === "pending").map((p) => p.amount));
}

export function netWorth(d: AppData, today: ISODate): NetWorth {
  const byType = (t: string) => sum(d.assets.filter((a) => a.type === t).map((a) => a.value));
  const assets = {
    cash: sum(activeAccounts(d).map((a) => accountBalance(a, d.transactions))),
    investments: sum(d.investments.map((i) => i.currentValue)),
    property: byType("imovel"),
    vehicles: byType("veiculo"),
    other: byType("outro"),
    receivables: byType("a_receber") + pendingReceivables(d),
  };
  const lb = (t: string) => sum(d.liabilities.filter((l) => l.type === t).map((l) => l.balance));
  const liabilities = {
    financing: lb("financiamento"),
    loans: lb("emprestimo"),
    debts: lb("divida"),
    payable: lb("a_pagar"),
    cards: sum(allCardSummaries(d, today).map((s) => s.used)),
  };
  const totalAssets = sum(Object.values(assets));
  const totalLiabilities = sum(Object.values(liabilities));
  return { assets, liabilities, totalAssets, totalLiabilities, net: totalAssets - totalLiabilities };
}

export interface NetWorthPoint { month: MonthKey; assets: Cents; liabilities: Cents; net: Cents }

/** Histórico mensal: fechamentos salvos + mês atual calculado ao vivo. */
export function netWorthHistory(d: AppData, today: ISODate, months = 12): NetWorthPoint[] {
  const cur = monthOf(today);
  const live = netWorth(d, today);
  return lastMonths(cur, months).map((m) => {
    if (m === cur) return { month: m, assets: live.totalAssets, liabilities: live.totalLiabilities, net: live.net };
    const s = d.snapshots.find((x) => x.month === m);
    return s ? { month: m, assets: s.assets, liabilities: s.liabilities, net: s.assets - s.liabilities } : null;
  }).filter((x): x is NetWorthPoint => !!x);
}

export function netWorthChange(d: AppData, today: ISODate, monthsBack: number): { delta: Cents; from: MonthKey | null } {
  const hist = netWorthHistory(d, today, monthsBack + 1);
  if (hist.length < 2) return { delta: 0, from: null };
  return { delta: hist[hist.length - 1].net - hist[0].net, from: hist[0].month };
}

export { addMonthsKey };
