import type { AppData, Category, Nature } from "@/types";
import { uid } from "@/utils/id";

export const DASHBOARD_CARDS = [
  "networth", "cash", "income", "expense", "result", "saved", "savingsRate", "invested", "reserve", "invoices",
] as const;

export const CARD_LABELS: Record<string, string> = {
  networth: "Patrimônio líquido", cash: "Saldo disponível", income: "Receita do mês", expense: "Despesas do mês",
  result: "Resultado do mês", saved: "Valor economizado", savingsRate: "Taxa de economia",
  invested: "Investido no mês", reserve: "Reserva de emergência", invoices: "Faturas de cartão abertas",
};

export function emptyData(): AppData {
  return {
    accounts: [], categories: defaultCategories(), transactions: [], installments: [], creditCards: [], subscriptions: [],
    recurring: [], budgets: [], goals: [], emergencyEntries: [], investments: [], investmentTransactions: [],
    assets: [], liabilities: [], snapshots: [], clients: [], professionalIncome: [], notifications: [],
    settings: {
      userName: "", theme: "system", monthlyInvestmentPlan: 0, taxRatePct: 6, horizonDays: 30,
      hiddenCards: [], cardOrder: [...DASHBOARD_CARDS],
    },
    emergencyFund: { essentialMonthly: 0, targetMonths: 6, monthlyContribution: 0, location: "" },
  };
}

type Def = [name: string, color: string, nature: Nature, essential: boolean, subs?: string[]];

const EXPENSES: Def[] = [
  ["Moradia", "#64748b", "fixed", true, ["Aluguel", "Manutenção"]],
  ["Condomínio", "#78716c", "fixed", true],
  ["Energia", "#d97706", "fixed", true],
  ["Água", "#0ea5e9", "fixed", true],
  ["Internet", "#6366f1", "fixed", true],
  ["Mercado", "#16a34a", "variable", true, ["Hortifruti", "Açougue", "Limpeza"]],
  ["Alimentação", "#ea580c", "variable", true, ["Padaria", "Almoço"]],
  ["Delivery", "#f43f5e", "variable", false],
  ["Transporte", "#0891b2", "variable", true, ["App de transporte", "Estacionamento", "Manutenção do carro"]],
  ["Combustível", "#ca8a04", "variable", true],
  ["Saúde", "#e11d48", "fixed", true, ["Plano de saúde", "Farmácia", "Consultas"]],
  ["Academia", "#14b8a6", "fixed", false],
  ["Educação", "#4f46e5", "fixed", true, ["Cursos", "Livros"]],
  ["Lazer", "#a855f7", "variable", false, ["Cinema", "Eventos", "Bares"]],
  ["Restaurantes", "#fb923c", "variable", false],
  ["Viagens", "#06b6d4", "eventual", false],
  ["Compras", "#c026d3", "variable", false],
  ["Roupas", "#db2777", "variable", false],
  ["Eletrônicos", "#3b82f6", "eventual", false],
  ["Assinaturas", "#8b5cf6", "fixed", false],
  ["Pets", "#84cc16", "variable", false],
  ["Presentes", "#f97316", "eventual", false],
  ["Impostos", "#475569", "fixed", true],
  ["Seguros", "#0d9488", "fixed", true],
  ["Investimentos", "#7c3aed", "variable", false],
  ["Trabalho", "#2563eb", "variable", false],
  ["Software", "#4338ca", "fixed", false],
  ["Hospedagem", "#0369a1", "fixed", false],
  ["Publicidade", "#be123c", "variable", false],
  ["Outros", "#94a3b8", "variable", false],
];

const INCOMES: Def[] = [
  ["Salário", "#16a34a", "fixed", false],
  ["Pró-labore", "#15803d", "fixed", false],
  ["Clientes", "#059669", "variable", false],
  ["Freelance", "#10b981", "variable", false],
  ["Rendimentos", "#7c3aed", "variable", false],
  ["Reembolsos", "#0ea5e9", "eventual", false],
  ["Outras receitas", "#84cc16", "eventual", false],
];

export function defaultCategories(): Category[] {
  const out: Category[] = [];
  const add = (defs: Def[], kind: "expense" | "income") => {
    for (const [name, color, nature, essential, subs] of defs) {
      const id = uid();
      out.push({ id, name, parentId: null, kind, color, nature, essential });
      for (const s of subs ?? []) out.push({ id: uid(), name: s, parentId: id, kind, color, nature, essential });
    }
  };
  add(EXPENSES, "expense");
  add(INCOMES, "income");
  return out;
}
