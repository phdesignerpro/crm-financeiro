"use client";
import { Download, Filter, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useEntryModal } from "@/components/forms/EntryModal";
import { TransactionList } from "@/components/transactions/TransactionList";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { Field, SelectInput, TextInput, MoneyInput } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { useData, useToday } from "@/hooks/useStore";
import type { Cents } from "@/types";
import { toCSV, downloadText } from "@/utils/csv";
import { addMonthsKey, monthEnd, monthOf, monthStart, formatDate } from "@/utils/date";
import { formatBRL, sum } from "@/utils/money";
import { norm } from "@/utils/labels";

interface Filters {
  q: string; from: string; to: string; type: string; category: string; account: string; card: string; scope: string;
  min: Cents | null; max: Cents | null; tag: string; status: string;
}
const PAGE = 40;

export default function MovimentacoesPage() {
  const d = useData();
  const today = useToday();
  const openEntry = useEntryModal();
  const cur = monthOf(today);
  const initial: Filters = { q: "", from: monthStart(addMonthsKey(cur, -2)), to: monthEnd(cur), type: "", category: "", account: "", card: "", scope: "", min: null, max: null, tag: "", status: "" };
  const [f, setF] = useState<Filters>(initial);
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => { setF((c) => ({ ...c, [k]: v })); setLimit(PAGE); };

  const allTags = useMemo(() => [...new Set(d.transactions.flatMap((t) => t.tags))].sort(), [d.transactions]);
  const rows = useMemo(() => {
    const q = norm(f.q);
    return d.transactions
      .filter((t) => {
        if (f.from && t.date < f.from) return false;
        if (f.to && t.date > f.to) return false;
        if (f.type === "card" ? !(t.cardId && t.kind === "expense") : f.type && t.kind !== f.type) return false;
        if (f.category && t.categoryId !== f.category && d.categories.find((c) => c.id === t.categoryId)?.parentId !== f.category) return false;
        if (f.account && t.accountId !== f.account && t.toAccountId !== f.account) return false;
        if (f.card && t.cardId !== f.card) return false;
        if (f.scope && t.scope !== f.scope) return false;
        if (f.min != null && Math.abs(t.amount) < f.min) return false;
        if (f.max != null && Math.abs(t.amount) > f.max) return false;
        if (f.tag && !t.tags.includes(f.tag)) return false;
        if (f.status && t.status !== f.status) return false;
        if (q && !norm(`${t.description} ${t.notes} ${t.tags.join(" ")}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [d.transactions, d.categories, f]);

  const income = sum(rows.filter((t) => t.kind === "income" && t.status === "paid").map((t) => t.amount));
  const expense = sum(rows.filter((t) => t.kind === "expense" && t.status === "paid").map((t) => t.amount));
  const active = Object.entries(f).filter(([k, v]) => v !== "" && v != null && !["from", "to"].includes(k)).length;

  const exportCsv = () => {
    const cat = (id: string | null) => d.categories.find((c) => c.id === id)?.name ?? "";
    const acc = (id: string | null) => d.accounts.find((a) => a.id === id)?.name ?? "";
    downloadText("movimentacoes.csv", toCSV([
      ["Data", "Tipo", "Descrição", "Valor", "Categoria", "Conta", "Cartão", "Status", "Escopo", "Tags"],
      ...rows.map((t) => [formatDate(t.date), t.kind, t.description, (t.amount / 100).toFixed(2).replace(".", ","), cat(t.categoryId), acc(t.accountId), d.creditCards.find((c) => c.id === t.cardId)?.name ?? "", t.status, t.scope, t.tags.join(" ")]),
    ]));
  };

  return (
    <>
      <PageHeader title="Movimentações" description="Todas as entradas, saídas, compras no cartão, aportes e transferências."
        actions={<><Button onClick={exportCsv}><Download size={15} />CSV</Button><Button variant="primary" onClick={() => openEntry()}><Plus size={15} />Nova</Button></>} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="!p-4"><p className="text-xs text-muted">Entradas no filtro</p><p className="num text-lg font-semibold text-income">{formatBRL(income)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Despesas no filtro</p><p className="num text-lg font-semibold text-expense">{formatBRL(expense)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Resultado</p><p className="num text-lg font-semibold">{formatBRL(income - expense)}</p></Card>
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <TextInput className="pl-9" placeholder="Pesquisar descrição, observação ou tag" value={f.q} onChange={(e) => set("q", e.target.value)} aria-label="Pesquisar" />
          </div>
          <Button onClick={() => setShowFilters((s) => !s)}><Filter size={15} />Filtros{active > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] text-white">{active}</span>}</Button>
          {(active > 0 || f.from !== initial.from || f.to !== initial.to) && <Button variant="ghost" onClick={() => setF(initial)}><X size={14} />Limpar</Button>}
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-3 border-b border-line bg-surface-2/40 p-3 md:grid-cols-4">
            <Field label="De"><TextInput type="date" value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
            <Field label="Até"><TextInput type="date" value={f.to} onChange={(e) => set("to", e.target.value)} /></Field>
            <Field label="Tipo"><SelectInput value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="">Todos</option><option value="income">Entradas</option><option value="expense">Saídas</option><option value="card">Compras no cartão</option>
              <option value="transfer">Transferências</option><option value="invoice_payment">Pagamento de fatura</option><option value="investment">Investimentos</option></SelectInput></Field>
            <Field label="Categoria"><SelectInput value={f.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Todas</option>{d.categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
            <Field label="Conta"><SelectInput value={f.account} onChange={(e) => set("account", e.target.value)}>
              <option value="">Todas</option>{d.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput></Field>
            <Field label="Cartão"><SelectInput value={f.card} onChange={(e) => set("card", e.target.value)}>
              <option value="">Todos</option>{d.creditCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
            <Field label="Pessoal / profissional"><SelectInput value={f.scope} onChange={(e) => set("scope", e.target.value)}>
              <option value="">Ambos</option><option value="personal">Pessoal</option><option value="professional">Profissional</option></SelectInput></Field>
            <Field label="Status"><SelectInput value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="">Todos</option><option value="paid">Efetivado</option><option value="pending">Pendente / futuro</option></SelectInput></Field>
            <Field label="Valor mínimo"><MoneyInput value={f.min} onChange={(v) => set("min", v)} /></Field>
            <Field label="Valor máximo"><MoneyInput value={f.max} onChange={(v) => set("max", v)} /></Field>
            <Field label="Tag"><SelectInput value={f.tag} onChange={(e) => set("tag", e.target.value)}>
              <option value="">Todas</option>{allTags.map((t) => <option key={t} value={t}>#{t}</option>)}</SelectInput></Field>
          </div>
        )}
        {rows.length === 0 ? <EmptyState title="Nenhuma movimentação encontrada" description="Ajuste os filtros ou cadastre uma nova movimentação." action={<Button variant="primary" onClick={() => openEntry()}>Nova movimentação</Button>} /> : (
          <>
            <TransactionList txs={rows.slice(0, limit)} />
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
              <span>Mostrando {Math.min(limit, rows.length)} de {rows.length}</span>
              {limit < rows.length && <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>Carregar mais</Button>}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
