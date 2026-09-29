import type { AppData, ISODate } from "@/types";
import { addDays, addMonthsKey, lastMonths, monthEnd, monthLabel, monthName, monthOf, monthStart } from "@/utils/date";
import { formatBRL, formatPct, parseMoney, sum } from "@/utils/money";
import { norm } from "@/utils/labels";
import { availableForReal, projectCashflow } from "./commitments";
import { allCardSummaries, cashBalance, monthSummary, spendingByCategory } from "./finance";
import { netWorth } from "./networth";
import { emergencyStatus } from "./planning";
import { annualEquivalent, monthlyEquivalent } from "./schedule";

export interface AssistantReply {
  text: string;
  sections?: { title: string; lines: string[] }[];
  verdict?: "ok" | "warn" | "bad";
}

export const SUGGESTIONS = [
  "Quanto gastei com restaurantes nos últimos 3 meses?",
  "Quanto minha despesa aumentou este ano?",
  "Posso separar R$ 3.000 para uma viagem?",
  "Quanto estou gastando com assinaturas?",
  "Qual categoria mais pesa no meu orçamento?",
  "Quanto economizei nos últimos 6 meses?",
  "Quanto tenho de parcelas futuras?",
  "Se continuar assim, quanto terei daqui a um ano?",
];

const CATEGORY_ALIASES: Record<string, string> = {
  restaurante: "Restaurantes", restaurantes: "Restaurantes", ifood: "Delivery", delivery: "Delivery", mercado: "Mercado",
  supermercado: "Mercado", combustivel: "Combustível", gasolina: "Combustível", uber: "Transporte", transporte: "Transporte",
  lazer: "Lazer", saude: "Saúde", farmacia: "Saúde", academia: "Academia", viagem: "Viagens", viagens: "Viagens",
  compras: "Compras", roupas: "Roupas", pets: "Pets", pet: "Pets", educacao: "Educação", moradia: "Moradia", aluguel: "Moradia",
  energia: "Energia", agua: "Água", internet: "Internet", alimentacao: "Alimentação", presentes: "Presentes", impostos: "Impostos",
  seguros: "Seguros", software: "Software", publicidade: "Publicidade", eletronicos: "Eletrônicos",
};

function detectCategory(q: string, d: AppData): { id: string; name: string } | null {
  const words = q.split(/[^a-z0-9]+/);
  for (const w of words) {
    const alias = CATEGORY_ALIASES[w];
    if (alias) {
      const c = d.categories.find((x) => x.name === alias && !x.parentId);
      if (c) return { id: c.id, name: c.name };
    }
  }
  for (const c of d.categories.filter((x) => !x.parentId && x.kind === "expense")) {
    if (q.includes(norm(c.name))) return { id: c.id, name: c.name };
  }
  return null;
}

interface Period { from: ISODate; to: ISODate; label: string; months: number }

function detectPeriod(q: string, today: ISODate, fallbackMonths: number): Period {
  const cur = monthOf(today);
  const m = q.match(/ultimos?\s+(\d+)\s+(mes|meses|dias|dia|semanas)/);
  if (m) {
    const n = Number(m[1]);
    if (m[2].startsWith("dia")) return { from: addDays(today, -(n - 1)), to: today, label: `últimos ${n} dias`, months: n / 30 };
    if (m[2].startsWith("semana")) return { from: addDays(today, -(n * 7 - 1)), to: today, label: `últimas ${n} semanas`, months: (n * 7) / 30 };
    return { from: monthStart(addMonthsKey(cur, -(n - 1))), to: today, label: `últimos ${n} meses`, months: n };
  }
  if (/este ano|no ano|ano atual/.test(q)) return { from: `${today.slice(0, 4)}-01-01`, to: today, label: "este ano", months: Number(today.slice(5, 7)) };
  if (/mes passado|mes anterior/.test(q)) { const p = addMonthsKey(cur, -1); return { from: monthStart(p), to: monthEnd(p), label: monthLabel(p), months: 1 }; }
  if (/este mes|neste mes|mes atual/.test(q)) return { from: monthStart(cur), to: today, label: "este mês", months: 1 };
  return { from: monthStart(addMonthsKey(cur, -(fallbackMonths - 1))), to: today, label: `últimos ${fallbackMonths} meses`, months: fallbackMonths };
}

function purchaseImpact(d: AppData, today: ISODate, amount: number, label: string, onCard: boolean): AssistantReply {
  const before = availableForReal(d, today);
  const after = before.available - amount;
  const proj = projectCashflow(d, today, 90, { oneOffs: onCard ? [] : [{ amount, date: addDays(today, 1), label }] });
  const projWith = onCard ? projectCashflow(d, today, 90, { oneOffs: [{ amount, date: addDays(today, 30), label }] }) : proj;
  const res = emergencyStatus(d, today);
  const cards = allCardSummaries(d, today);
  const goalsMonthly = sum(d.goals.filter((g) => g.current < g.target).map((g) => g.monthly));
  const essential = d.emergencyFund.essentialMonthly;
  const margin = after;
  const verdict: AssistantReply["verdict"] = margin < 0 || projWith.minBalance < 0 ? "bad" : margin < essential * 0.25 ? "warn" : "ok";

  const headline =
    verdict === "ok"
      ? `Sim, dá para separar ${formatBRL(amount)} sem comprometer suas contas cadastradas — mas veja o impacto abaixo.`
      : verdict === "warn"
      ? `Dá, porém apertado: depois de separar ${formatBRL(amount)} sobrariam só ${formatBRL(margin)} livres.`
      : `Não é recomendável agora: ${formatBRL(amount)} superam o que está realmente disponível (${formatBRL(before.available)}).`;

  return {
    verdict, text: headline,
    sections: [
      { title: "Saldo disponível", lines: [
        `Saldo atual em contas: ${formatBRL(before.balance)}.`,
        `Disponível de verdade hoje: ${formatBRL(before.available)} → depois da compra: ${formatBRL(after)}.`,
      ] },
      { title: "Despesas futuras (próximos " + before.horizonDays + " dias)", lines: [
        `Contas e despesas programadas: ${formatBRL(before.bills + before.scheduled + before.installments)}.`,
        `Faturas de cartão: ${formatBRL(before.cards)}.`,
      ] },
      { title: "Reserva de emergência", lines: [
        res.essential ? `Você tem ${res.monthsCovered.toFixed(1).replace(".", ",")} meses de reserva (${formatBRL(res.current)}). Este valor não foi usado na análise.` : "Reserva ainda não configurada.",
        before.reserve + before.investments > 0 ? `Aportes ainda planejados neste mês: ${formatBRL(before.reserve + before.investments)} (já descontados do disponível).` : "Aportes do mês já realizados.",
      ] },
      { title: "Metas", lines: [
        goalsMonthly > 0 ? `Suas metas pedem ${formatBRL(goalsMonthly)} por mês. Gastar ${formatBRL(amount)} equivale a ${(amount / goalsMonthly).toFixed(1).replace(".", ",")} mês(es) desse aporte.` : "Nenhum aporte mensal de metas configurado.",
      ] },
      { title: "Cartão", lines: cards.length
        ? [`Se for no cartão, o melhor limite é o do ${[...cards].sort((a, b) => b.available - a.available)[0].card.name}, com ${formatBRL([...cards].sort((a, b) => b.available - a.available)[0].available)} livres.`]
        : ["Nenhum cartão cadastrado."] },
      { title: "Impacto no fluxo de caixa (90 dias)", lines: [
        `Saldo mínimo projetado sem a compra: ${formatBRL(proj.minBalance === projWith.minBalance && !onCard ? projectCashflow(d, today, 90).minBalance : projectCashflow(d, today, 90).minBalance)}.`,
        `Saldo mínimo com a compra: ${formatBRL(projWith.minBalance)} (em ${projWith.minDate.split("-").reverse().join("/")}).`,
        `Saldo projetado em 90 dias: ${formatBRL(projWith.endBalance)}.`,
      ] },
    ],
  };
}

/** Assistente por regras: interpreta perguntas em português e responde consultando os dados reais. */
export function answer(question: string, d: AppData, today: ISODate): AssistantReply {
  const q = norm(question);
  const cur = monthOf(today);
  const amountMatch = question.match(/R\$\s*[\d.,]+|\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b|\b\d{3,}(?:,\d{2})?\b/);
  const amount = amountMatch ? parseMoney(amountMatch[0]) : NaN;

  // posso gastar / separar / comprar
  if (/\b(posso|consigo|da pra|cabe|devo)\b/.test(q) && !Number.isNaN(amount) && amount > 0) {
    const onCard = /cartao|credito|parcel/.test(q);
    const label = /viagem/.test(q) ? "Viagem" : /carro/.test(q) ? "Carro" : /notebook|computador/.test(q) ? "Computador" : "Compra";
    return purchaseImpact(d, today, amount, label, onCard);
  }

  if (/(daqui a|em) (um|1|12) ano|se continuar|quanto terei|projecao|projetar/.test(q)) {
    const p = projectCashflow(d, today, 365);
    const nw = netWorth(d, today).net;
    const surplus = p.monthly.reduce((s, r) => s + r.income - r.bills - r.invoices - r.variable, 0);
    return {
      text: `Mantendo o padrão atual, seu saldo em contas em 12 meses seria de ${formatBRL(p.endBalance)} (hoje: ${formatBRL(p.start)}).`,
      sections: [{ title: "Detalhes da projeção", lines: [
        `Resultado operacional acumulado em 12 meses: ${formatBRL(surplus)}.`,
        `Aportes previstos (investimentos, reserva e metas): ${formatBRL(p.monthly.reduce((s, r) => s + r.invest + r.reserve + r.goals, 0))}, que continuam sendo patrimônio.`,
        `Patrimônio líquido estimado (sem valorização): ${formatBRL(nw + surplus)}.`,
        `Menor saldo no período: ${formatBRL(p.minBalance)} em ${p.minDate.split("-").reverse().join("/")}.`,
        "Premissas: receitas recorrentes e mensalidades de clientes, contas e parcelas cadastradas, gastos variáveis pela média de 3 meses. Receitas avulsas futuras não são previstas.",
      ] }],
    };
  }

  if (/assinatura/.test(q)) {
    const subs = d.subscriptions.filter((s) => s.active);
    const monthly = sum(subs.map((s) => monthlyEquivalent(s.amount, s.frequency)));
    return {
      text: `Você gasta ${formatBRL(monthly)} por mês com ${subs.length} assinaturas — ${formatBRL(sum(subs.map((s) => annualEquivalent(s.amount, s.frequency))))} por ano.`,
      sections: [{ title: "Maiores assinaturas", lines: [...subs].sort((a, b) => monthlyEquivalent(b.amount, b.frequency) - monthlyEquivalent(a.amount, a.frequency)).slice(0, 6).map((s) => `${s.name}: ${formatBRL(monthlyEquivalent(s.amount, s.frequency))}/mês`) }],
    };
  }

  if (/parcela/.test(q)) {
    const future = d.transactions.filter((t) => t.installmentId && t.kind === "expense" && t.date > today && t.status === "pending");
    const total = sum(future.map((t) => t.amount));
    const byMonth = new Map<string, number>();
    for (const t of future) byMonth.set(monthOf(t.date), (byMonth.get(monthOf(t.date)) ?? 0) + t.amount);
    return {
      text: `Você tem ${formatBRL(total)} em ${future.length} parcelas futuras.`,
      sections: [{ title: "Por mês", lines: [...byMonth.entries()].sort().slice(0, 8).map(([m, v]) => `${monthName(m)}/${m.slice(0, 4)}: ${formatBRL(v)}`) }],
    };
  }

  if (/categoria/.test(q) && /(pesa|mais|maior)/.test(q) || /onde (eu )?gasto mais|maior gasto/.test(q)) {
    const cat = spendingByCategory(d, monthStart(cur), today, "all");
    const total = sum(cat.map((c) => c.total));
    const top = cat.slice(0, 5);
    return {
      text: top.length ? `${top[0].name} é a categoria que mais pesa neste mês: ${formatBRL(top[0].total)} (${formatPct((top[0].total / total) * 100, 0)} dos gastos).` : "Ainda não há despesas neste mês.",
      sections: [{ title: "Top categorias do mês", lines: top.map((c) => `${c.name}: ${formatBRL(c.total)} (${formatPct((c.total / total) * 100, 0)})`) }],
    };
  }

  if (/economi[zs]ei|economia|guardei|sobrou/.test(q)) {
    const p = detectPeriod(q, today, 6);
    const months = lastMonths(cur, Math.max(1, Math.round(p.months)));
    const rows = months.map((m) => ({ m, ...monthSummary(d, m, "all") }));
    const saved = sum(rows.map((r) => r.result));
    const income = sum(rows.map((r) => r.income));
    return {
      text: `Nos ${p.label} você economizou ${formatBRL(saved)}${income ? ` (${formatPct((saved / income) * 100, 0)} da renda)` : ""}.`,
      sections: [{ title: "Mês a mês", lines: rows.map((r) => `${monthName(r.m)}: ${formatBRL(r.result)}`) }],
    };
  }

  if (/despesa|gasto/.test(q) && /(aument|cresc|subiu|evolu)/.test(q)) {
    const p = detectPeriod(q, today, 6);
    const months = lastMonths(cur, Math.max(2, Math.round(p.months)));
    const rows = months.map((m) => ({ m, e: monthSummary(d, m, "all").expense })).filter((r) => r.e > 0);
    if (rows.length < 2) return { text: "Ainda não há meses suficientes com despesas para comparar." };
    const first = rows[0];
    const last = rows[rows.length - 2] ?? rows[rows.length - 1];
    const ch = ((last.e - first.e) / first.e) * 100;
    return {
      text: `Sua despesa mensal ${ch >= 0 ? "aumentou" : "diminuiu"} ${formatPct(Math.abs(ch), 1)}: de ${formatBRL(first.e)} em ${monthName(first.m)} para ${formatBRL(last.e)} em ${monthName(last.m)}.`,
      sections: [{ title: "Despesas por mês", lines: rows.map((r) => `${monthName(r.m)}: ${formatBRL(r.e)}`) }],
    };
  }

  if (/quanto (eu )?(gastei|gasto|gastou)|gastos? com/.test(q)) {
    const cat = detectCategory(q, d);
    const p = detectPeriod(q, today, 3);
    if (cat) {
      const list = d.transactions.filter((t) => t.kind === "expense" && t.status === "paid" && t.date >= p.from && t.date <= p.to && (t.categoryId === cat.id || d.categories.find((c) => c.id === t.categoryId)?.parentId === cat.id));
      const total = sum(list.map((t) => t.amount));
      const byMonth = new Map<string, number>();
      for (const t of list) byMonth.set(monthOf(t.date), (byMonth.get(monthOf(t.date)) ?? 0) + t.amount);
      return {
        text: `Você gastou ${formatBRL(total)} com ${cat.name.toLowerCase()} nos ${p.label} (${list.length} lançamentos).`,
        sections: [{ title: "Por mês", lines: [...byMonth.entries()].sort().map(([m, v]) => `${monthName(m)}: ${formatBRL(v)}`) }],
      };
    }
    const s = spendingByCategory(d, p.from, p.to, "all");
    return { text: `Você gastou ${formatBRL(sum(s.map((c) => c.total)))} nos ${p.label}.`, sections: [{ title: "Por categoria", lines: s.slice(0, 6).map((c) => `${c.name}: ${formatBRL(c.total)}`) }] };
  }

  if (/reserva/.test(q)) {
    const r = emergencyStatus(d, today);
    return { text: `Sua reserva é de ${formatBRL(r.current)}, o equivalente a ${r.monthsCovered.toFixed(1).replace(".", ",")} meses do custo essencial (${formatBRL(r.essential)}). Meta de ${r.targetMonths} meses: ${formatPct(r.pct, 0)} concluída${r.etaMonths ? `, previsão de ${r.etaMonths} meses mantendo os aportes` : ""}.` };
  }

  if (/patrimonio/.test(q)) {
    const n = netWorth(d, today);
    return { text: `Seu patrimônio líquido é ${formatBRL(n.net)}: ${formatBRL(n.totalAssets)} em ativos menos ${formatBRL(n.totalLiabilities)} em passivos.` };
  }

  if (/disponivel|quanto tenho|saldo|posso gastar/.test(q)) {
    const a = availableForReal(d, today);
    return {
      text: `Seu saldo é ${formatBRL(cashBalance(d))}, mas o disponível de verdade para gastar é ${formatBRL(a.available)}.`,
      sections: [{ title: `Comprometido nos próximos ${a.horizonDays} dias`, lines: [
        `Contas e despesas programadas: ${formatBRL(a.bills + a.scheduled)}`, `Parcelas: ${formatBRL(a.installments)}`, `Faturas de cartão: ${formatBRL(a.cards)}`,
        `Investimentos programados: ${formatBRL(a.investments)}`, `Reserva: ${formatBRL(a.reserve)}`, `Impostos reservados: ${formatBRL(a.taxes)}`,
      ] }],
    };
  }

  const cat = detectCategory(q, d);
  if (cat) {
    const p = detectPeriod(q, today, 3);
    const total = sum(d.transactions.filter((t) => t.kind === "expense" && t.status === "paid" && t.date >= p.from && t.date <= p.to && t.categoryId === cat.id).map((t) => t.amount));
    return { text: `Em ${cat.name}, você gastou ${formatBRL(total)} nos ${p.label}.` };
  }

  return {
    text: "Não entendi essa pergunta com os dados que tenho. Tente algo como as sugestões abaixo — consulto seus lançamentos, cartões, metas e projeções reais.",
    sections: [{ title: "Exemplos", lines: SUGGESTIONS }],
  };
}
