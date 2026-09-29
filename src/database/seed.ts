import type {
  Account, AppData, Cents, Client, CreditCard, Frequency, ID, ISODate, Investment, InvestmentTransaction,
  ProfessionalIncome, Scope, Subscription, Transaction, RecurringTransaction,
} from "@/types";
import { cardInvoices, accountBalance } from "@/services/finance";
import { netWorth } from "@/services/networth";
import { computeMaterialization } from "@/services/schedule";
import { buildInstallments, emptyTx } from "@/services/transactions";
import { addDays, addMonths, addMonthsKey, dayOf, lastMonths, monthOf } from "@/utils/date";
import { uid } from "@/utils/id";
import { emptyData } from "./defaults";

const R = (reais: number): Cents => Math.round(reais * 100);

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dados fictícios realistas (pt-BR / BRL), gerados relativos à data de hoje. */
export function buildDemoData(today: ISODate): AppData {
  const d = emptyData();
  const rand = rng(20260929);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const cur = monthOf(today);
  const months = lastMonths(cur, 12);

  const root = (name: string) => d.categories.find((c) => c.name === name && !c.parentId)!;
  const cat = (name: string) => root(name).id;
  const sub = (name: string) => d.categories.find((c) => c.name === name && c.parentId)?.id ?? null;
  const natureOf = (name: string) => root(name).nature;

  /* Contas */
  const mkAcc = (institution: string, name: string, type: Account["type"], target: Cents, color: string, icon: string): Account & { target: Cents } =>
    ({ id: uid(), institution, name, type, initialBalance: 0, color, icon, archived: false, target });
  const accs = [
    mkAcc("Nubank", "Conta Nubank", "digital", R(11240), "#8b5cf6", "wallet"),
    mkAcc("Inter", "Conta Corrente Inter", "corrente", R(4860), "#f97316", "landmark"),
    mkAcc("Carteira", "Carteira", "carteira", R(420), "#16a34a", "banknote"),
    mkAcc("Inter Empresas", "Conta PJ", "empresarial", R(6700), "#2563eb", "briefcase"),
    mkAcc("XP Investimentos", "Conta XP (caixa)", "investimentos", R(1250), "#0f172a", "trending-up"),
  ];
  const [nu, inter, , pj, xp] = accs;

  /* Cartões */
  const cards: CreditCard[] = [
    { id: uid(), bank: "Nubank", name: "Nubank Mastercard", limit: R(14000), closingDay: 25, dueDay: 2, accountId: nu.id, color: "#8b5cf6" },
    { id: uid(), bank: "Inter", name: "Inter Gold Visa", limit: R(9000), closingDay: 5, dueDay: 12, accountId: inter.id, color: "#f97316" },
    { id: uid(), bank: "Inter Empresas", name: "Cartão PJ Inter", limit: R(6000), closingDay: 10, dueDay: 17, accountId: pj.id, color: "#2563eb" },
  ];
  const [cNu, cInter, cPj] = cards;

  const txs: Transaction[] = [];
  const at = (m: string, day: number): ISODate => {
    const date = addMonths(`${m}-01`, 0, day);
    return date > today ? today : date;
  };
  const push = (p: Partial<Transaction> & Pick<Transaction, "kind" | "description" | "amount" | "date">) => {
    const card = p.cardId ? cards.find((c) => c.id === p.cardId) : null;
    txs.push({
      ...emptyTx(), status: "paid", accountId: card?.accountId ?? null, paymentMethod: card ? "credito" : "pix", ...p,
      categoryId: p.categoryId ?? null,
    });
  };
  const spend = (categoryName: string, description: string, amount: Cents, date: ISODate, opts: Partial<Transaction> = {}) =>
    push({
      kind: "expense", description, amount, date, categoryId: cat(categoryName), nature: natureOf(categoryName),
      accountId: nu.id, ...opts,
    });

  /* Recorrências e assinaturas (materializadas mais abaixo) */
  const start = `${months[0]}-01`;
  const rule = (
    kind: "income" | "expense", description: string, amount: Cents, categoryName: string, day: number,
    accountId: ID, o: Partial<RecurringTransaction> = {},
  ): RecurringTransaction => ({
    id: uid(), kind, description, amount, categoryId: cat(categoryName), accountId, cardId: null, scope: "personal",
    nature: natureOf(categoryName), tags: [], frequency: "monthly", startDate: addMonths(start, 0, day), endDate: null,
    active: true, generatedThrough: null, ...o,
  });
  d.recurring = [
    rule("income", "Salário — Agência Vórtice", R(7800), "Salário", 5, nu.id),
    rule("expense", "Aluguel", R(2300), "Moradia", 8, nu.id, { nature: "fixed" }),
    rule("expense", "Condomínio", R(480), "Condomínio", 10, nu.id),
    rule("expense", "Internet Fibra 500MB", R(119.9), "Internet", 12, inter.id),
    rule("expense", "Plano de saúde Unimed", R(520), "Saúde", 15, nu.id, { cardId: cNu.id }),
    rule("expense", "Seguro do carro", R(236.5), "Seguros", 18, inter.id, { cardId: cInter.id }),
    rule("expense", "Parcela financiamento T-Cross", R(1150), "Transporte", 20, inter.id, { nature: "fixed" }),
    rule("expense", "Contador (Contabilizei)", R(350), "Trabalho", 10, pj.id, { scope: "professional", nature: "fixed" }),
    rule("expense", "DAS — Simples Nacional", R(640), "Impostos", 20, pj.id, { scope: "professional" }),
  ];

  const subscription = (
    name: string, amount: Cents, day: number, o: Partial<Subscription> & { categoryName: string },
  ): Subscription => {
    const { categoryName, ...rest } = o;
    return {
      id: uid(), name, amount, previousAmount: null, cardId: null, accountId: null, categoryId: cat(categoryName), scope: "personal",
      usage: "alto", frequency: "monthly", startDate: addMonths(start, 0, day), endDate: null, active: true, generatedThrough: null, ...rest,
    };
  };
  const startAgo = (n: number, day: number) => addMonths(`${cur}-01`, -n, day);
  d.subscriptions = [
    subscription("Netflix", R(55.9), 9, { categoryName: "Assinaturas", cardId: cNu.id, accountId: nu.id, previousAmount: R(44.9), usage: "medio" }),
    subscription("Spotify Família", R(34.9), 11, { categoryName: "Assinaturas", cardId: cNu.id, accountId: nu.id }),
    subscription("iCloud+ 200GB", R(14.9), 3, { categoryName: "Assinaturas", cardId: cNu.id, accountId: nu.id }),
    subscription("Academia Smart Fit", R(129.9), 7, { categoryName: "Academia", cardId: cInter.id, accountId: inter.id, usage: "baixo" }),
    subscription("YouTube Premium", R(24.9), 14, { categoryName: "Assinaturas", cardId: cInter.id, accountId: inter.id, usage: "baixo" }),
    subscription("Adobe Creative Cloud", R(289.9), 4, { categoryName: "Software", cardId: cPj.id, accountId: pj.id, scope: "professional" }),
    subscription("Figma Professional", R(92), 6, { categoryName: "Software", cardId: cPj.id, accountId: pj.id, scope: "professional" }),
    subscription("ChatGPT Plus", R(110), 12, { categoryName: "Software", cardId: cPj.id, accountId: pj.id, scope: "professional", previousAmount: R(100), startDate: startAgo(5, 12) }),
    subscription("Google Workspace", R(72), 16, { categoryName: "Software", cardId: cPj.id, accountId: pj.id, scope: "professional" }),
    subscription("Servidor VPS (hospedagem)", R(129), 21, { categoryName: "Hospedagem", cardId: cPj.id, accountId: pj.id, scope: "professional", usage: "medio" }),
    subscription("Domínios .com.br (Registro.br)", R(240), 22, { categoryName: "Hospedagem", cardId: cPj.id, accountId: pj.id, scope: "professional", frequency: "yearly" as Frequency, startDate: addMonths(`${cur}-01`, -5, 22) }),
  ];

  /* Contas de consumo e gastos variáveis mensais */
  for (const m of months) {
    const isCur = m === cur;
    spend("Energia", "Conta de energia — Enel", R(between(150, 240)), at(m, 14), { accountId: nu.id, paymentMethod: "boleto" });
    spend("Água", "Conta de água — Sabesp", R(between(68, 105)), at(m, 16), { accountId: nu.id, paymentMethod: "boleto" });

    const shops: [string, string, [number, number], number, ID | null][] = [
      ["Mercado", "Compras do mês — Carrefour", [180, 330], 4, cNu.id],
      ["Alimentação", "Padaria / almoço", [24, 62], 6, null],
      ["Delivery", "iFood", [38, 78], isCur ? 8 : 5, cNu.id],
      ["Restaurantes", "Restaurante", [90, 170], isCur ? 4 : 3, cNu.id],
      ["Combustível", "Posto Ipiranga", [190, 260], 2, cInter.id],
      ["Transporte", "Uber", [18, 46], 4, null],
      ["Lazer", "Cinema / bar / evento", [60, 210], 3, cNu.id],
      ["Compras", "Compra online — Amazon", [55, 320], 2, cInter.id],
      ["Saúde", "Farmácia Drogasil", [45, 130], 1, null],
      ["Pets", "Pet shop — ração e banho", [90, 210], 2, cNu.id],
    ];
    for (const [c, desc, [lo, hi], n, cardId] of shops) {
      for (let i = 0; i < n; i++) {
        const day = 1 + Math.floor(rand() * 27);
        const date = at(m, day);
        if (date > today) continue;
        const factor = isCur && c === "Delivery" ? 1.25 : 1;
        spend(c, desc, R(between(lo, hi) * factor), date, {
          cardId, accountId: cardId ? cards.find((k) => k.id === cardId)!.accountId : nu.id,
          paymentMethod: cardId ? "credito" : c === "Transporte" ? "pix" : "debito",
          subcategoryId: c === "Mercado" ? sub("Hortifruti") : c === "Alimentação" ? sub("Padaria") : c === "Saúde" ? sub("Farmácia") : null,
        });
      }
    }
    if (rand() > 0.55) spend("Presentes", "Presente de aniversário", R(between(120, 280)), at(m, 20), { cardId: cNu.id, accountId: nu.id, paymentMethod: "credito" });
    if (rand() > 0.6) spend("Roupas", "Roupas — Zara / Renner", R(between(150, 420)), at(m, 9), { cardId: cInter.id, accountId: inter.id, paymentMethod: "credito" });

    // profissional variável
    if (rand() > 0.35) push({ kind: "expense", description: "Meta Ads — campanha de clientes", amount: R(between(220, 420)), date: at(m, 13), categoryId: cat("Publicidade"), nature: "variable", scope: "professional", cardId: cPj.id, accountId: pj.id, paymentMethod: "credito" });
    if (rand() > 0.6) push({ kind: "expense", description: "Coworking — diárias", amount: R(between(90, 180)), date: at(m, 22), categoryId: cat("Trabalho"), nature: "variable", scope: "professional", accountId: pj.id, paymentMethod: "pix" });
    if (rand() > 0.7) push({ kind: "income", description: "Rendimentos — dividendos e FIIs", amount: R(between(110, 190)), date: at(m, 15), categoryId: cat("Rendimentos"), accountId: xp.id, nature: "variable" });
  }

  /* Compras parceladas */
  const installmentPlans = [] as ReturnType<typeof buildInstallments>["plan"][];
  const inst = (desc: string, total: Cents, count: number, monthsAgo: number, day: number, card: CreditCard, category: string, scope: Scope = "personal") => {
    const { plan, transactions } = buildInstallments({
      description: desc, total, count, date: addMonths(`${cur}-01`, -monthsAgo, day), cardId: card.id, accountId: card.accountId,
      categoryId: cat(category), scope, nature: natureOf(category), today,
    });
    installmentPlans.push(plan);
    txs.push(...transactions);
  };
  inst("MacBook Air M3", R(8900), 10, 4, 12, cNu, "Eletrônicos");
  inst("Passagens aéreas — Japão", R(3200), 8, 2, 18, cInter, "Viagens");
  inst("Cadeira ergonômica Herman Miller", R(1500), 6, 2, 8, cPj, "Trabalho", "professional");
  inst("Monitor LG UltraFine 27\"", R(2700), 5, 1, 21, cPj, "Eletrônicos", "professional");
  d.installments = installmentPlans;

  /* Investimentos: aportes mensais debitados da conta Nubank */
  const inv = (name: string, institution: string, category: Investment["category"], objective: string, liquidity: Investment["liquidity"], rateLabel: string, applied: number, current: number, maturity: ISODate | null = null): Investment => ({
    id: uid(), name, institution, category, objective, liquidity, maturity, rateLabel, appliedAmount: R(applied), currentValue: R(current),
    contributionDate: addMonths(`${cur}-01`, -1, 10), createdAt: new Date().toISOString(),
  });
  d.investments = [
    inv("Tesouro Selic 2029", "Tesouro Direto", "tesouro", "Reserva de emergência", "d1", "100% Selic", 20400, 22150),
    inv("CDB Liquidez Diária", "Inter", "reserva", "Reserva de emergência", "diaria", "102% do CDI", 9000, 9350),
    inv("CDB Banco Master Pré 2027", "XP Investimentos", "cdb", "Entrada do apartamento", "vencimento", "13,2% a.a.", 8000, 8710, addMonths(`${cur}-01`, 14, 15)),
    inv("Tesouro IPCA+ 2035", "Tesouro Direto", "renda_fixa", "Aposentadoria", "d1", "IPCA + 6,1%", 6500, 6920, "2035-05-15"),
    inv("WEGE3 / ITSA4", "XP Investimentos", "acoes", "Longo prazo", "d1", "Renda variável", 6800, 7640),
    inv("FIIs (HGLG11, XPML11, MXRF11)", "XP Investimentos", "fiis", "Renda passiva", "d1", "Renda variável", 6100, 6480),
    inv("IVVB11 / BOVA11", "XP Investimentos", "etfs", "Diversificação", "d1", "Renda variável", 5200, 5890),
    inv("Bitcoin", "Mercado Bitcoin", "cripto", "Especulativo (baixo %)", "d1", "Renda variável", 2400, 3120),
    inv("PGBL Icatu", "Banco Inter", "previdencia", "Aposentadoria", "baixa", "Renda variável", 9000, 9880),
  ];
  const plan = (n: string) => d.investments.find((i) => i.name.startsWith(n))!;
  const aportes: [string, number][] = [["Tesouro Selic", 500], ["FIIs", 500], ["IVVB11", 400], ["CDB Liquidez", 400]];
  const invTx: InvestmentTransaction[] = [];
  for (const m of months) {
    for (const [n, val] of aportes) {
      const date = at(m, 10);
      if (date > today) continue;
      const i = plan(n);
      invTx.push({ id: uid(), investmentId: i.id, date, type: "aporte", amount: R(val), accountId: nu.id });
      push({ kind: "investment", description: `Aporte — ${i.name}`, amount: R(val), date, accountId: nu.id, investmentId: i.id, categoryId: cat("Investimentos"), paymentMethod: "transferencia" });
    }
  }
  d.investmentTransactions = invTx;

  /* Clientes e receitas profissionais */
  const mkClient = (name: string, service: string, value: number, cost: number, dueDay: number, monthsAgo: number, status: Client["status"] = "ativo"): Client => ({
    id: uid(), name, service, monthlyValue: R(value), monthlyCost: R(cost), dueDay, status, startDate: addMonths(`${cur}-01`, -monthsAgo, 1), notes: "",
  });
  d.clients = [
    mkClient("Studio Aurora Arquitetura", "Identidade visual e social media", 2800, 240, 10, 11),
    mkClient("Clínica Vitalle", "Gestão de site e tráfego pago", 1900, 380, 5, 9),
    mkClient("Mercado Bom Preço", "Social media e materiais gráficos", 1500, 160, 15, 8),
    mkClient("TechNova SaaS", "Design de produto (retainer)", 3200, 210, 20, 7),
    mkClient("Cafeteria Grão Nobre", "Branding contínuo e cardápios", 950, 60, 8, 10),
    mkClient("Lima & Associados Advocacia", "Hospedagem e manutenção de site", 600, 130, 12, 6),
    mkClient("Academia Pulso", "Social media (contrato finalizado)", 1200, 90, 7, 11, "encerrado"),
  ];
  const charges: ProfessionalIncome[] = [];
  const receivedTx = (p: ProfessionalIncome, clientId: ID | null) =>
    push({
      kind: "income", description: p.description, amount: p.amount, date: p.receivedDate!, categoryId: cat("Clientes"), nature: "variable",
      scope: "professional", accountId: pj.id, paymentMethod: "pix", clientId, chargeId: p.id,
    });
  for (const c of d.clients) {
    const first = monthOf(c.startDate);
    const closedAt = c.status === "encerrado" ? addMonthsKey(cur, -4) : null;
    for (const m of months) {
      if (m < first || (closedAt && m > closedAt)) continue;
      const dueDate = addMonths(`${m}-01`, 0, c.dueDay);
      const paidDate = addDays(dueDate, Math.floor(rand() * 3));
      const overdue = c.name.startsWith("Mercado") && m >= addMonthsKey(cur, -1);
      const received = !overdue && paidDate <= today;
      const p: ProfessionalIncome = {
        id: uid(), clientId: c.id, description: `Mensalidade — ${c.name}`, amount: c.monthlyValue, dueDate,
        receivedDate: received ? paidDate : null, status: received ? "received" : "pending", type: "recorrente", competence: m, accountId: pj.id,
      };
      charges.push(p);
      if (received) receivedTx(p, c.id);
    }
  }
  const oneOff = (description: string, amount: number, dueDate: ISODate, received: boolean) => {
    const p: ProfessionalIncome = {
      id: uid(), clientId: null, description, amount: R(amount), dueDate, receivedDate: received ? dueDate : null,
      status: received ? "received" : "pending", type: "avulso", competence: monthOf(dueDate), accountId: pj.id,
    };
    charges.push(p);
    if (received) receivedTx(p, null);
  };
  oneOff("Identidade visual — Padaria Pão Dourado", 3200, addMonths(`${cur}-01`, -9, 18), true);
  oneOff("Landing page — Dr. Rafael Menezes", 2400, addMonths(`${cur}-01`, -6, 9), true);
  oneOff("Ilustrações — Editora Horizonte", 1800, addMonths(`${cur}-01`, -4, 25), true);
  oneOff("Site institucional — Construtora Alvorada", 4800, addMonths(`${cur}-01`, -2, 14), true);
  oneOff("Social media pack — Bar do Zé", 900, addMonths(`${cur}-01`, -1, 6), true);
  oneOff("Redesign de embalagem — Grão Nobre", 2200, at(cur, 3), true);
  oneOff("Manual de marca — Studio Aurora", 3500, addDays(today, 12), false);
  d.professionalIncome = charges;

  d.accounts = accs.map(({ target: _t, ...a }) => a);
  d.creditCards = cards;

  /* Materializa recorrências/assinaturas do histórico */
  d.transactions = txs;
  const mat = computeMaterialization({ ...d, transactions: txs }, today);
  txs.push(...mat.newTransactions);
  for (const u of mat.recurringUpdates) d.recurring.find((r) => r.id === u.id)!.generatedThrough = u.generatedThrough;
  for (const u of mat.subscriptionUpdates) d.subscriptions.find((s) => s.id === u.id)!.generatedThrough = u.generatedThrough;
  for (const t of txs) if (t.cardId && t.kind === "expense") t.status = t.date <= today ? "paid" : "pending";

  /* Pagamento das faturas já vencidas (não duplica despesa: só move dinheiro conta → cartão) */
  for (const card of cards) {
    for (const invc of cardInvoices(card, txs, today)) {
      if (invc.dueDate <= today && invc.total > 0) {
        txs.push({
          ...emptyTx(), kind: "invoice_payment", description: `Pagamento fatura ${card.name}`, amount: invc.total, date: invc.dueDate,
          cardId: card.id, accountId: card.accountId, invoiceKey: invc.key, paymentMethod: "transferencia", status: "paid",
          scope: card.id === cPj.id ? "professional" : "personal",
        });
      }
    }
  }
  d.transactions = txs.sort((a, b) => b.date.localeCompare(a.date));

  /* Ajusta saldos iniciais para que o saldo atual seja o desejado */
  d.accounts = accs.map(({ target, ...a }) => {
    const zero = accountBalance({ ...a, initialBalance: 0 }, d.transactions);
    return { ...a, initialBalance: target - zero };
  });

  /* Reserva de emergência */
  d.emergencyFund = { essentialMonthly: R(5850), targetMonths: 9, monthlyContribution: R(1000), location: "Tesouro Selic 2029 + CDB Liquidez Diária" };
  d.emergencyEntries = [
    { id: uid(), date: addMonths(`${cur}-01`, -12, 1), amount: R(19500), note: "Saldo inicial da reserva" },
    ...months.map((m) => ({ id: uid(), date: at(m, 6), amount: R(1000), note: "Aporte mensal" })).filter((e) => e.date <= today),
  ];
  d.emergencyEntries = d.emergencyEntries.filter((e) => e.date <= today);
  const reserveSum = d.emergencyEntries.reduce((s, e) => s + e.amount, 0);
  if (reserveSum !== R(31500)) d.emergencyEntries[0].amount += R(31500) - reserveSum;

  /* Metas */
  const goal = (name: string, category: AppData["goals"][number]["category"], target: number, current: number, monthsAhead: number, monthly: number, priority: "alta" | "media" | "baixa") => ({
    id: uid(), name, category, target: R(target), current: R(current), deadline: addMonths(today, monthsAhead), monthly: R(monthly), priority,
    createdAt: new Date().toISOString(),
  });
  d.goals = [
    goal("Viagem ao Japão", "viagem", 28000, 9200, 14, 900, "alta"),
    goal("Entrada do apartamento", "imovel", 80000, 21000, 36, 1200, "media"),
    goal("Novo setup (Mac Studio + monitor)", "computador", 9000, 5500, 5, 400, "media"),
    goal("Aposentadoria (PGBL)", "aposentadoria", 300000, 9880, 240, 500, "baixa"),
  ];

  /* Orçamento mensal */
  const bud = (name: string, amount: number) => ({ id: uid(), categoryId: cat(name), amount: R(amount) });
  d.budgets = [
    bud("Mercado", 1300), bud("Alimentação", 1500), bud("Delivery", 350), bud("Restaurantes", 500), bud("Lazer", 800),
    bud("Compras", 600), bud("Viagens", 1000), bud("Transporte", 700), bud("Combustível", 450), bud("Pets", 300),
  ];

  /* Patrimônio */
  const asset = (name: string, type: "imovel" | "veiculo" | "outro" | "a_receber", value: number) => ({ id: uid(), name, type, value: R(value) });
  d.assets = [
    asset("Volkswagen T-Cross 2022", "veiculo", 88000),
    asset("Equipamentos de trabalho (iMac, monitores)", "outro", 14000),
    asset("Restituição de Imposto de Renda", "a_receber", 1850),
  ];
  d.liabilities = [
    { id: uid(), name: "Financiamento T-Cross", type: "financiamento", balance: R(24300), monthlyPayment: R(1150) },
    { id: uid(), name: "Parcelamento IPVA", type: "divida", balance: R(780), monthlyPayment: R(260) },
  ];
  d.settings = { ...d.settings, userName: "", monthlyInvestmentPlan: R(1800), taxRatePct: 6, horizonDays: 30 };

  /* Histórico patrimonial (fechamentos mensais anteriores) */
  const live = netWorth(d, today);
  d.snapshots = months.filter((m) => m !== cur).map((m) => {
    const k = months.length - 1 - months.indexOf(m);
    const noise = 1 + (rand() - 0.5) * 0.25;
    return {
      id: uid(), month: m,
      assets: Math.round(live.totalAssets - k * R(1450) * noise),
      liabilities: Math.round(live.totalLiabilities + k * R(260) * noise),
    };
  });
  return d;
}

export { dayOf };
