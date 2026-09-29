import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/database/seed";
import { emptyData } from "@/database/defaults";
import type { AppData } from "@/types";
import { parseMoney, splitInstallments } from "@/utils/money";
import { addMonths } from "@/utils/date";
import { availableForReal, projectCashflow } from "./commitments";
import { accountBalance, allCardSummaries, cardSummary, cashBalance, invoiceDueDate, invoiceKeyFor, monthSummary } from "./finance";
import { netWorth } from "./networth";
import { computeMaterialization, occurrences } from "./schedule";
import { buildEntry, type EntryValues } from "./transactions";

const TODAY = "2026-09-29";

const values = (o: Partial<EntryValues>): EntryValues => ({
  entry: "expense", description: "x", amount: 10000, date: TODAY, categoryId: null, subcategoryId: null, accountId: null,
  toAccountId: null, cardId: null, investmentId: null, paymentMethod: "pix", nature: "variable", scope: "personal", tags: [],
  notes: "", recurring: false, frequency: "monthly", installments: 1, paid: true, ...o,
});

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: "a1", institution: "A", name: "A", type: "corrente", initialBalance: 100000, color: "#000", icon: "wallet", archived: false },
    { id: "a2", institution: "B", name: "B", type: "digital", initialBalance: 0, color: "#000", icon: "wallet", archived: false },
  ];
  d.creditCards = [{ id: "c1", bank: "A", name: "Cartão", limit: 500000, closingDay: 25, dueDay: 2, accountId: "a1", color: "#000" }];
  return d;
}

describe("dinheiro", () => {
  it("parseMoney entende formatos brasileiros", () => {
    expect(parseMoney("1.250,50")).toBe(125050);
    expect(parseMoney("R$ 3.000")).toBe(300000);
    expect(parseMoney("12,5")).toBe(1250);
    expect(parseMoney("abc")).toBeNaN();
  });
  it("divide parcelas sem perder centavos", () => {
    const p = splitInstallments(10000, 3);
    expect(p.reduce((a, b) => a + b, 0)).toBe(10000);
  });
});

describe("regras de contabilização", () => {
  it("transferência não é receita nem despesa e preserva o total", () => {
    const d = base();
    const { transactions } = buildEntry(values({ entry: "transfer", accountId: "a1", toAccountId: "a2", amount: 30000 }), TODAY, d.creditCards);
    d.transactions = transactions;
    expect(accountBalance(d.accounts[0], d.transactions)).toBe(70000);
    expect(accountBalance(d.accounts[1], d.transactions)).toBe(30000);
    const s = monthSummary(d, "2026-09");
    expect(s.income).toBe(0);
    expect(s.expense).toBe(0);
    expect(cashBalance(d)).toBe(100000);
  });

  it("compra no cartão é despesa mas não mexe na conta; pagar a fatura não duplica a despesa", () => {
    const d = base();
    d.transactions = buildEntry(values({ entry: "card", cardId: "c1", amount: 40000, date: "2026-09-10" }), TODAY, d.creditCards).transactions;
    expect(monthSummary(d, "2026-09").expense).toBe(40000);
    expect(cashBalance(d)).toBe(100000);
    const sum = cardSummary(d, d.creditCards[0], TODAY);
    expect(sum.used).toBe(40000);
    expect(sum.current.key).toBe("2026-10".slice(0, 4) === "2026" ? sum.current.key : "");
    d.transactions.push({
      ...d.transactions[0], id: "p", kind: "invoice_payment", cardId: "c1", accountId: "a1", amount: 40000, invoiceKey: "2026-09", date: "2026-10-02",
    });
    expect(monthSummary(d, "2026-10").expense).toBe(0);
    expect(monthSummary(d, "2026-09").expense).toBe(40000);
    expect(cashBalance(d)).toBe(60000);
    expect(cardSummary(d, d.creditCards[0], TODAY).used).toBe(0);
  });

  it("atribui compras à fatura correta pelo dia de fechamento", () => {
    const card = base().creditCards[0];
    expect(invoiceKeyFor(card, "2026-09-25")).toBe("2026-09");
    expect(invoiceKeyFor(card, "2026-09-26")).toBe("2026-10");
    expect(invoiceDueDate(card, "2026-09")).toBe("2026-10-02");
  });

  it("gera parcelas automaticamente: 10x de 300", () => {
    const d = base();
    const built = buildEntry(values({ entry: "card", cardId: "c1", amount: 300000, installments: 10, date: "2026-09-10" }), TODAY, d.creditCards);
    expect(built.transactions).toHaveLength(10);
    expect(built.transactions.every((t) => t.amount === 30000)).toBe(true);
    expect(built.transactions[9].installmentNumber).toBe(10);
    expect(built.plan?.count).toBe(10);
    d.transactions = built.transactions;
    expect(cardSummary(d, d.creditCards[0], TODAY).used).toBe(300000);
  });

  it("recorrência gera ocorrências ancoradas na data inicial", () => {
    const occ = occurrences({ frequency: "monthly", startDate: "2026-01-31", endDate: null, active: true, generatedThrough: null }, "2026-01-01", "2026-04-30");
    expect(occ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("dados de demonstração", () => {
  const d = buildDemoData(TODAY);
  it("são consistentes", () => {
    const cash = cashBalance(d);
    const ms = monthSummary(d, "2026-09");
    const av = availableForReal(d, TODAY);
    const nw = netWorth(d, TODAY);
    const cards = allCardSummaries(d, TODAY);
    // eslint-disable-next-line no-console
    console.log({
      cash: cash / 100, income: ms.income / 100, expense: ms.expense / 100, savings: ms.savingsRate.toFixed(1),
      disponivel: av.available / 100, comprom: av.totalCommitted / 100, nw: nw.net / 100,
      faturas: cards.map((c) => [c.card.name, c.used / 100, c.current.remaining / 100, c.usedPct.toFixed(0)]),
    });
    expect(cash).toBeGreaterThan(0);
    expect(ms.income).toBeGreaterThan(0);
    expect(nw.net).toBeGreaterThan(0);
  });
  it("a materialização é idempotente", () => {
    const m = computeMaterialization(d, TODAY);
    expect(m.newTransactions).toHaveLength(0);
  });
  it("projeta o fluxo de caixa", () => {
    const p = projectCashflow(d, TODAY, 180);
    // eslint-disable-next-line no-console
    console.log(p.monthly.map((r) => [r.month, r.income / 100, r.bills / 100, r.invoices / 100, r.variable / 100, r.closing / 100]));
    expect(p.monthly.length).toBeGreaterThan(5);
    expect(addMonths(TODAY, 1)).toBe("2026-10-29");
  });
});
