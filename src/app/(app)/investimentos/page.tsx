"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Donut, Legend2, SimpleBars } from "@/components/charts/ChartKit";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, EmptyState } from "@/components/ui/Feedback";
import { Field, MoneyInput, SelectInput, TextInput } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { investmentMoveWithAccount } from "@/services/commands";
import { investmentStats } from "@/services/planning";
import type { Investment, InvestmentCategory, Liquidity } from "@/types";
import { formatDate, monthOf, lastMonths, monthShort } from "@/utils/date";
import { uid } from "@/utils/id";
import { INVESTMENT_COLOR, INVESTMENT_LABEL, LIQUIDITY_LABEL } from "@/utils/labels";
import { formatBRL, formatPct, sum } from "@/utils/money";

export default function InvestimentosPage() {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const confirm = useConfirm();
  const cur = monthOf(today);
  const st = useMemo(() => investmentStats(d, cur), [d, cur]);
  const [editing, setEditing] = useState<Partial<Investment> | null>(null);
  const [move, setMove] = useState<Investment | null>(null);
  const [filter, setFilter] = useState("");
  const list = d.investments.filter((i) => !filter || i.category === filter);
  const aportes = lastMonths(cur, 6).map((m) => ({ label: monthShort(m), value: sum(d.investmentTransactions.filter((t) => t.type === "aporte" && monthOf(t.date) === m).map((t) => t.amount)) }));

  const fields: FieldDef[] = [
    { name: "name", label: "Investimento", type: "text", required: true, placeholder: "Ex.: Tesouro Selic 2029" },
    { name: "institution", label: "Instituição", type: "text", required: true },
    { name: "category", label: "Categoria", type: "select", required: true, options: (Object.keys(INVESTMENT_LABEL) as InvestmentCategory[]).map((k) => ({ value: k, label: INVESTMENT_LABEL[k] })) },
    { name: "objective", label: "Objetivo", type: "text", placeholder: "Ex.: Reserva, aposentadoria" },
    { name: "appliedAmount", label: "Valor aplicado", type: "money", required: true, allowZero: true },
    { name: "currentValue", label: "Valor atual", type: "money", required: true, allowZero: true },
    { name: "contributionDate", label: "Data do aporte", type: "date", required: true },
    { name: "rateLabel", label: "Rentabilidade contratada", type: "text", placeholder: "Ex.: 110% do CDI" },
    { name: "liquidity", label: "Liquidez", type: "select", required: true, options: (Object.keys(LIQUIDITY_LABEL) as Liquidity[]).map((k) => ({ value: k, label: LIQUIDITY_LABEL[k] })) },
    { name: "maturity", label: "Vencimento", type: "date" },
  ];

  return (
    <>
      <PageHeader title="Investimentos" description="Carteira, rentabilidade e alocação. Informações educativas, sem garantia de retorno."
        actions={<Button variant="primary" onClick={() => setEditing({})}><Plus size={15} />Novo investimento</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["Total investido", formatBRL(st.applied), ""], ["Valor atual", formatBRL(st.current), "text-invest"], ["Valorização", formatBRL(st.gain), st.gain >= 0 ? "text-income" : "text-expense"],
          ["Rentabilidade", formatPct(st.returnPct, 1), st.returnPct >= 0 ? "text-income" : "text-expense"], ["Aportes do mês", formatBRL(st.monthAportes), ""]].map(([l, v, c]) => (
          <Card key={l} className="!p-4"><p className="text-xs text-muted">{l}</p><p className={`num mt-1 text-lg font-semibold ${c}`}>{v}</p></Card>
        ))}
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card><CardHeader title="Alocação da carteira" />
          <div className="grid items-center gap-4 sm:grid-cols-2"><Donut data={st.allocation.map((x) => ({ name: x.label, value: x.value, color: x.color }))} />
            <Legend2 items={st.allocation.map((x) => ({ name: x.label, value: formatBRL(x.value), color: x.color, pct: formatPct(x.pct, 0) }))} /></div></Card>
        <Card><CardHeader title="Aportes mensais" subtitle="Últimos 6 meses" /><SimpleBars data={aportes} color="invest" name="Aportes" /></Card>
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3"><CardHeader title="Seus investimentos" />
          <SelectInput className="!w-auto" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>
            {(Object.keys(INVESTMENT_LABEL) as InvestmentCategory[]).map((k) => <option key={k} value={k}>{INVESTMENT_LABEL[k]}</option>)}</SelectInput></div>
        {list.length === 0 ? <EmptyState title="Nenhum investimento" action={<Button variant="primary" onClick={() => setEditing({})}>Novo investimento</Button>} /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
            <thead><tr className="border-y border-line bg-surface-2/50"><th className="th">Investimento</th><th className="th">Categoria</th><th className="th text-right">Aplicado</th><th className="th text-right">Atual</th><th className="th text-right">Rentab.</th><th className="th">Liquidez</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">{list.map((i) => {
              const rt = i.appliedAmount ? ((i.currentValue - i.appliedAmount) / i.appliedAmount) * 100 : 0;
              return (
                <tr key={i.id}>
                  <td className="td"><p className="font-medium">{i.name}</p><p className="text-xs text-muted">{i.institution}{i.objective ? ` · ${i.objective}` : ""}{i.maturity ? ` · vence ${formatDate(i.maturity)}` : ""}</p></td>
                  <td className="td"><span className="inline-flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: INVESTMENT_COLOR[i.category] }} />{INVESTMENT_LABEL[i.category]}</span></td>
                  <td className="td num text-right">{formatBRL(i.appliedAmount)}</td>
                  <td className="td num text-right font-medium">{formatBRL(i.currentValue)}</td>
                  <td className="td text-right"><Badge tone={rt >= 0 ? "income" : "expense"}>{rt >= 0 ? "+" : ""}{formatPct(rt, 1)}</Badge>{i.rateLabel && <p className="mt-0.5 text-[11px] text-muted">{i.rateLabel}</p>}</td>
                  <td className="td text-xs text-muted">{LIQUIDITY_LABEL[i.liquidity]}</td>
                  <td className="td"><div className="flex justify-end"><Button size="sm" onClick={() => setMove(i)}>Movimentar</Button>
                    <IconButton label="Editar" onClick={() => setEditing(i)}><Pencil size={15} /></IconButton>
                    <IconButton label="Excluir" onClick={async () => { if (await confirm({ title: "Excluir investimento?", message: `${i.name} e seu histórico de aportes serão removidos.`, danger: true, confirmLabel: "Excluir" })) { a.remove("investmentTransactions", d.investmentTransactions.filter((t) => t.investmentId === i.id).map((t) => t.id)); a.remove("investments", i.id); } }}><Trash2 size={15} /></IconButton></div></td>
                </tr>
              );
            })}</tbody></table></div>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">Conteúdo educativo baseado nos dados que você cadastrou. Rentabilidade passada não garante retorno futuro e o sistema não recomenda produtos financeiros específicos.</p>

      <FormModal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar investimento" : "Novo investimento"} fields={fields}
        initial={{ name: "", institution: "", category: "renda_fixa", objective: "", appliedAmount: 0, currentValue: 0, contributionDate: today, rateLabel: "", liquidity: "d1", maturity: "", ...editing }}
        onSubmit={(v) => { const x = v as Partial<Investment>; a.add("investments", { createdAt: new Date().toISOString(), ...editing, ...x, maturity: x.maturity || null, id: editing?.id ?? uid() } as Investment); setEditing(null); }} />
      {move && <MoveModal inv={move} onClose={() => setMove(null)} />}
    </>
  );
}

function MoveModal({ inv, onClose }: { inv: Investment; onClose: () => void }) {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const [type, setType] = useState<"aporte" | "resgate" | "rendimento">("aporte");
  const [amt, setAmt] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [acc, setAcc] = useState(d.accounts.find((x) => !x.archived && x.type !== "investimentos")?.id ?? "");
  const err = !amt ? "Informe o valor" : type === "resgate" && amt > inv.currentValue ? "Maior que o valor atual" : "";
  return (
    <Modal open onClose={onClose} title={`Movimentar — ${inv.name}`} size="sm"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!!err} onClick={() => { investmentMoveWithAccount(a, d, inv, { type, amount: amt!, date, accountId: type === "rendimento" ? null : acc || null }); onClose(); }}>Confirmar</Button></>}>
      <div className="space-y-4">
        <Field label="Tipo"><SelectInput value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="aporte">Aporte</option><option value="resgate">Resgate</option><option value="rendimento">Rendimento / atualização de valor</option></SelectInput></Field>
        <Field label="Valor" error={amt ? err : ""}><MoneyInput value={amt} onChange={setAmt} /></Field>
        <Field label="Data"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {type !== "rendimento" && <Field label={type === "aporte" ? "Sai da conta" : "Entra na conta"}><SelectInput value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">Não movimentar conta</option>{d.accounts.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectInput></Field>}
      </div>
    </Modal>
  );
}
