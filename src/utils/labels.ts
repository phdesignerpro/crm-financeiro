import type {
  AccountType, GoalCategory, InvestmentCategory, Liquidity, Nature, PaymentMethod, Scope,
} from "@/types";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  corrente: "Conta corrente", digital: "Conta digital", carteira: "Carteira", dinheiro: "Dinheiro",
  empresarial: "Conta empresarial", investimentos: "Conta de investimentos",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix", debito: "Débito", credito: "Crédito", dinheiro: "Dinheiro", boleto: "Boleto", transferencia: "Transferência", outro: "Outro",
};

export const NATURE_LABEL: Record<Nature, string> = { fixed: "Fixa", variable: "Variável", eventual: "Eventual" };
export const SCOPE_LABEL: Record<Scope, string> = { personal: "Pessoal", professional: "Profissional" };

export const INVESTMENT_LABEL: Record<InvestmentCategory, string> = {
  reserva: "Reserva / liquidez", cdb: "CDB", tesouro: "Tesouro Direto", renda_fixa: "Renda fixa", acoes: "Ações", fiis: "FIIs",
  etfs: "ETFs", cripto: "Criptomoedas", previdencia: "Previdência", outros: "Outros",
};

export const INVESTMENT_COLOR: Record<InvestmentCategory, string> = {
  reserva: "#0ea5e9", cdb: "#6366f1", tesouro: "#7c3aed", renda_fixa: "#a78bfa", acoes: "#16a34a", fiis: "#f59e0b",
  etfs: "#14b8a6", cripto: "#f97316", previdencia: "#ec4899", outros: "#94a3b8",
};

export const LIQUIDITY_LABEL: Record<Liquidity, string> = {
  diaria: "Diária", d1: "D+1", d30: "D+30", vencimento: "No vencimento", baixa: "Baixa (longo prazo)",
};

export const GOAL_LABEL: Record<GoalCategory, string> = {
  viagem: "Viagem", carro: "Carro", computador: "Computador", imovel: "Entrada de imóvel", reserva: "Reserva de emergência",
  casamento: "Casamento", investimento: "Investimento", aposentadoria: "Aposentadoria", outro: "Outro",
};

export const PRIORITY_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

export const ASSET_LABEL = { imovel: "Imóvel", veiculo: "Veículo", outro: "Outro bem", a_receber: "Valor a receber" } as const;
export const LIABILITY_LABEL = { financiamento: "Financiamento", emprestimo: "Empréstimo", divida: "Dívida", a_pagar: "Valor a pagar" } as const;

/** Remove acentos e caixa para buscas. */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
