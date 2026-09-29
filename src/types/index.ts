/**
 * Modelo de domínio.
 * - Valores monetários são SEMPRE inteiros em centavos (Cents) — sem ponto flutuante.
 * - Datas são strings ISO "YYYY-MM-DD"; meses são "YYYY-MM".
 */
export type ID = string;
export type Cents = number;
export type ISODate = string;
export type MonthKey = string;

export type Scope = "personal" | "professional";
export type Nature = "fixed" | "variable" | "eventual";
export type TxKind = "income" | "expense" | "transfer" | "invoice_payment" | "investment";
export type TxStatus = "paid" | "pending";
export type PaymentMethod = "pix" | "debito" | "credito" | "dinheiro" | "boleto" | "transferencia" | "outro";

export type AccountType = "corrente" | "digital" | "carteira" | "dinheiro" | "empresarial" | "investimentos";

export interface Account {
  id: ID;
  institution: string;
  name: string;
  type: AccountType;
  /** Saldo antes do primeiro lançamento registrado. O saldo atual é calculado. */
  initialBalance: Cents;
  color: string;
  icon: string;
  archived: boolean;
}

export interface Category {
  id: ID;
  name: string;
  parentId: ID | null;
  kind: "expense" | "income";
  color: string;
  nature: Nature;
  /** Conta como custo essencial para a reserva de emergência. */
  essential: boolean;
}

export interface Transaction {
  id: ID;
  kind: TxKind;
  description: string;
  amount: Cents;
  date: ISODate;
  status: TxStatus;
  categoryId: ID | null;
  subcategoryId: ID | null;
  accountId: ID | null;
  /** Destino de transferências. */
  toAccountId: ID | null;
  /** Compra no cartão (kind = expense) ou fatura paga (kind = invoice_payment). */
  cardId: ID | null;
  paymentMethod: PaymentMethod;
  nature: Nature;
  scope: Scope;
  tags: string[];
  notes: string;
  recurringId: ID | null;
  subscriptionId: ID | null;
  installmentId: ID | null;
  installmentNumber: number | null;
  installmentCount: number | null;
  /** Fatura quitada por este pagamento (mês de fechamento). */
  invoiceKey: MonthKey | null;
  investmentId: ID | null;
  clientId: ID | null;
  chargeId: ID | null;
  createdAt: string;
  /** Ocorrência projetada (não persistida). */
  virtual?: boolean;
}

export interface InstallmentPlan {
  id: ID;
  description: string;
  total: Cents;
  count: number;
  startDate: ISODate;
  cardId: ID | null;
  accountId: ID | null;
  categoryId: ID | null;
  scope: Scope;
  status: "active" | "cancelled" | "completed";
  createdAt: string;
}

export interface CreditCard {
  id: ID;
  bank: string;
  name: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
  accountId: ID | null;
  color: string;
}

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

interface Schedulable {
  frequency: Frequency;
  /** Âncora das cobranças (primeira data). */
  startDate: ISODate;
  endDate: ISODate | null;
  active: boolean;
  /** Última ocorrência já gerada como lançamento. */
  generatedThrough: ISODate | null;
}

export interface Subscription extends Schedulable {
  id: ID;
  name: string;
  amount: Cents;
  previousAmount: Cents | null;
  cardId: ID | null;
  accountId: ID | null;
  categoryId: ID | null;
  scope: Scope;
  usage: "alto" | "medio" | "baixo" | null;
}

export interface RecurringTransaction extends Schedulable {
  id: ID;
  kind: "income" | "expense";
  description: string;
  amount: Cents;
  categoryId: ID | null;
  accountId: ID | null;
  cardId: ID | null;
  scope: Scope;
  nature: Nature;
  tags: string[];
}

export interface Budget {
  id: ID;
  categoryId: ID;
  amount: Cents;
}

export type GoalCategory =
  | "viagem" | "carro" | "computador" | "imovel" | "reserva" | "casamento" | "investimento" | "aposentadoria" | "outro";

export interface Goal {
  id: ID;
  name: string;
  category: GoalCategory;
  target: Cents;
  current: Cents;
  deadline: ISODate;
  monthly: Cents;
  priority: "alta" | "media" | "baixa";
  createdAt: string;
}

export interface EmergencyFund {
  essentialMonthly: Cents;
  targetMonths: 3 | 6 | 9 | 12;
  monthlyContribution: Cents;
  location: string;
}

export interface EmergencyEntry {
  id: ID;
  date: ISODate;
  /** Positivo = aporte; negativo = resgate. */
  amount: Cents;
  note: string;
}

export type InvestmentCategory =
  | "reserva" | "cdb" | "tesouro" | "renda_fixa" | "acoes" | "fiis" | "etfs" | "cripto" | "previdencia" | "outros";

export type Liquidity = "diaria" | "d1" | "d30" | "vencimento" | "baixa";

export interface Investment {
  id: ID;
  name: string;
  institution: string;
  category: InvestmentCategory;
  objective: string;
  liquidity: Liquidity;
  maturity: ISODate | null;
  /** Rentabilidade contratada (texto livre, ex.: "110% do CDI"). */
  rateLabel: string;
  appliedAmount: Cents;
  currentValue: Cents;
  contributionDate: ISODate;
  createdAt: string;
}

export interface InvestmentTransaction {
  id: ID;
  investmentId: ID;
  date: ISODate;
  type: "aporte" | "resgate" | "rendimento";
  amount: Cents;
  accountId: ID | null;
}

export interface Asset {
  id: ID;
  name: string;
  type: "imovel" | "veiculo" | "outro" | "a_receber";
  value: Cents;
}

export interface Liability {
  id: ID;
  name: string;
  type: "financiamento" | "emprestimo" | "divida" | "a_pagar";
  balance: Cents;
  monthlyPayment: Cents;
}

export interface PatrimonySnapshot {
  id: ID;
  month: MonthKey;
  assets: Cents;
  liabilities: Cents;
}

export interface Client {
  id: ID;
  name: string;
  service: string;
  monthlyValue: Cents;
  monthlyCost: Cents;
  dueDay: number;
  status: "ativo" | "pausado" | "encerrado";
  startDate: ISODate;
  notes: string;
}

export interface ProfessionalIncome {
  id: ID;
  clientId: ID | null;
  description: string;
  amount: Cents;
  dueDate: ISODate;
  receivedDate: ISODate | null;
  status: "pending" | "received";
  type: "recorrente" | "avulso";
  competence: MonthKey | null;
  accountId: ID | null;
}

export interface AppNotification {
  /** Chave estável do alerta gerado pelas regras. */
  id: string;
  readAt: string | null;
}

export interface FinancialInsight {
  id: ID;
  text: string;
  createdAt: string;
}

export interface Settings {
  userName: string;
  theme: "system" | "light" | "dark";
  /** Aporte mensal em investimentos programado. */
  monthlyInvestmentPlan: Cents;
  /** % da receita profissional reservada para impostos. */
  taxRatePct: number;
  horizonDays: number;
  hiddenCards: string[];
  cardOrder: string[];
}

/** Coleções persistidas (listas). */
export interface Collections {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  installments: InstallmentPlan[];
  creditCards: CreditCard[];
  subscriptions: Subscription[];
  recurring: RecurringTransaction[];
  budgets: Budget[];
  goals: Goal[];
  emergencyEntries: EmergencyEntry[];
  investments: Investment[];
  investmentTransactions: InvestmentTransaction[];
  assets: Asset[];
  liabilities: Liability[];
  snapshots: PatrimonySnapshot[];
  clients: Client[];
  professionalIncome: ProfessionalIncome[];
  notifications: AppNotification[];
}

export interface AppData extends Collections {
  settings: Settings;
  emergencyFund: EmergencyFund;
}

export type CollectionKey = keyof Collections;
