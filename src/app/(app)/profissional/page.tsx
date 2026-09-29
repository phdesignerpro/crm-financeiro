"use client";
import { Check, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { SimpleBars, StackedBars, useChartColors } from "@/components/charts/ChartKit";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { useEntryModal } from "@/components/forms/EntryModal";
import { TransactionList } from "@/components/transactions/TransactionList";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, EmptyState, type Tone } from "@/components/ui/Feedback";
import { Field, SelectInput, TextInput } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { createOneOffService, receiveCharge, undoReceive } from "@/services/commands";
import { daysLate, isOverdue, professionalSummary, receivableForecast, type ClientStatus } from "@/services/professional";
import type { Client, ProfessionalIncome } from "@/types";
import { formatDate, lastMonths, monthLabel, monthOf, monthShort } from "@/utils/date";
import { uid } from "@/utils/id";
import { formatBRL, sum } from "@/utils/money";

const STATUS: Record<ClientStatus, Tone> = { ativo: "income", inadimplente: "expense", pausado: "warn", encerrado: "neutral" };

export default function ProfissionalPage() {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const confirm = useConfirm();
  const c = useChartColors();
  const openEntry = useEntryModal();
  const cur = monthOf(today);
  const s = useMemo(() => professionalSummary(d, cur, today), [d, cur, today]);
  const [tab, setTab] = useState<"previsao" | "clientes" | "cobrancas" | "despesas">("previsao");
  const [oneOff, setOneOff] = useState(false);
  const forecast = useMemo(() => receivableForecast(d, today, 6), [d, today]);
  const [client, setClient] = useState<Partial<Client> | null>(null);
  const [charge, setCharge] = useState<Partial<ProfessionalIncome> | null>(null);
  const [receiving, setReceiving] = useState<ProfessionalIncome | null>(null);
  const [acc, setAcc] = useState(d.accounts.find((x) => x.type === "empresarial")?.id ?? d.accounts[0]?.id ?? "");

  const months = lastMonths(cur, 6);
  const rev = months.map((m) => {
    const ch = d.professionalIncome.filter((p) => p.status === "received" && p.receivedDate && monthOf(p.receivedDate) === m);
    return { label: monthShort(m), rec: sum(ch.filter((p) => p.type === "recorrente").map((p) => p.amount)), av: sum(ch.filter((p) => p.type === "avulso").map((p) => p.amount)) };
  });
  const profit = months.map((m) => {
    const inc = sum(d.transactions.filter((t) => t.kind === "income" && t.scope === "professional" && t.status === "paid" && monthOf(t.date) === m).map((t) => t.amount));
    const exp = sum(d.transactions.filter((t) => t.kind === "expense" && t.scope === "professional" && t.status === "paid" && monthOf(t.date) === m).map((t) => t.amount));
    return { label: monthShort(m), value: inc - exp };
  });
  const charges = [...d.professionalIncome].sort((x, y) => (x.status === y.status ? y.dueDate.localeCompare(x.dueDate) : x.status === "pending" ? -1 : 1)).slice(0, 40);
  const proExpenses = d.transactions.filter((t) => t.scope === "professional" && t.kind === "expense").sort((x, y) => y.date.localeCompare(x.date)).slice(0, 25);
  const clientName = (id: string | null) => d.clients.find((x) => x.id === id)?.name ?? "Serviço avulso";

  const clientFields: FieldDef[] = [
    { name: "name", label: "Cliente", type: "text", required: true },
    { name: "service", label: "Serviço", type: "text", required: true },
    { name: "monthlyValue", label: "Valor mensal", type: "money", required: true, allowZero: true },
    { name: "dueDay", label: "Dia de vencimento", type: "number", required: true, min: 1, max: 31 },
    { name: "monthlyCost", label: "Custo mensal relacionado", type: "money", allowZero: true, hint: "Ferramentas, freelancers ou horas terceirizadas usados neste cliente." },
    { name: "status", label: "Status", type: "select", required: true, options: [{ value: "ativo", label: "Ativo" }, { value: "pausado", label: "Pausado" }, { value: "encerrado", label: "Encerrado" }] },
    { name: "startDate", label: "Início do contrato", type: "date", required: true },
    { name: "notes", label: "Observações", type: "textarea" },
  ];
  const chargeFields: FieldDef[] = [
    { name: "description", label: "Descrição", type: "text", required: true },
    { name: "clientId", label: "Cliente", type: "select", nullable: true, placeholder: "Sem cliente (avulso)", options: d.clients.map((x) => ({ value: x.id, label: x.name })) },
    { name: "amount", label: "Valor", type: "money", required: true },
    { name: "dueDate", label: "Vencimento", type: "date", required: true },
    { name: "type", label: "Tipo", type: "select", required: true, options: [{ value: "avulso", label: "Serviço avulso" }, { value: "recorrente", label: "Recorrente" }] },
  ];

  const oneOffFields: FieldDef[] = [
    { name: "description", label: "Serviço", type: "text", required: true, placeholder: "Ex.: Site institucional — Construtora Alvorada" },
    { name: "clientId", label: "Cliente (opcional)", type: "select", nullable: true, placeholder: "Sem cliente cadastrado", options: d.clients.map((x) => ({ value: x.id, label: x.name })) },
    { name: "amount", label: "Valor total", type: "money", required: true },
    { name: "dueDate", label: "Data prevista do pagamento", type: "date", required: true, hint: "Data do 1º recebimento." },
    { name: "installments", label: "Receber em quantas parcelas?", type: "number", required: true, min: 1, max: 24, hint: "1 = pagamento único. Parcelas mensais a partir da data prevista." },
  ];

  const kpis: [string, string, string][] = [
    ["MRR — receita recorrente", formatBRL(s.mrr), "text-info"], ["Serviços avulsos (mês)", formatBRL(s.oneOffReceived), ""], ["Receita total (mês)", formatBRL(s.revenue), "text-income"],
    ["Despesas profissionais", formatBRL(s.expenses), "text-expense"], ["Lucro estimado", formatBRL(s.profit), s.profit >= 0 ? "text-income" : "text-expense"],
    ["Clientes ativos", String(s.activeClients), ""], ["Clientes inadimplentes", String(s.delinquentClients), s.delinquentClients ? "text-expense" : ""], ["Valores a receber", formatBRL(s.receivables), "text-warn"],
  ];

  return (
    <>
      <PageHeader title="Finanças profissionais" description="Clientes, mensalidades, serviços avulsos, custos e lucro do seu negócio."
        actions={<><Button onClick={() => setCharge({})}>Nova cobrança</Button><Button onClick={() => setOneOff(true)}><Plus size={15} />Serviço avulso</Button><Button variant="primary" onClick={() => setClient({})}><Plus size={15} />Novo cliente</Button></>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map(([l, v, cl]) => <Card key={l} className="!p-4"><p className="text-xs text-muted">{l}</p><p className={`num mt-1 text-xl font-semibold ${cl}`}>{v}</p></Card>)}</div>

      {s.overdueCharges.length > 0 && (
        <div role="alert" className="mb-6 rounded-xl border border-expense/30 bg-expense/10 p-4 text-sm text-expense">
          <b>{s.overdueCharges.length} cobrança(s) vencida(s)</b> somando {formatBRL(s.overdue)}: {s.overdueCharges.map((p) => `${clientName(p.clientId)} (${daysLate(p, today)} dias)`).join(", ")}.
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Receita: recorrente x avulsa" subtitle="Recebido nos últimos 6 meses" />
          <StackedBars data={rev} keys={[{ key: "rec", label: "Recorrente", color: c.info }, { key: "av", label: "Avulsa", color: c.invest }]} /></Card>
        <Card><CardHeader title="Lucro por mês" subtitle="Receita − despesas profissionais" /><SimpleBars data={profit} color="income" name="Lucro" /></Card>
      </div>

      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ id: "previsao", label: "Previsão de recebimentos" }, { id: "clientes", label: "Clientes" }, { id: "cobrancas", label: "Cobranças" }, { id: "despesas", label: "Despesas profissionais" }]} />

      {tab === "previsao" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Card><CardHeader title="Quanto vou receber" subtitle="Mensalidades previstas + serviços avulsos combinados, próximos 6 meses" />
              <StackedBars data={forecast.map((f) => ({ label: monthShort(f.month), rec: f.recurring, av: f.oneOff, ja: f.received }))}
                keys={[{ key: "ja", label: "Já recebido", color: c.income }, { key: "rec", label: "Mensalidades a receber", color: c.info }, { key: "av", label: "Avulsos a receber", color: c.invest }]} /></Card>
            <Card><CardHeader title="Resumo por mês" />
              <ul className="divide-y divide-line text-sm">{forecast.map((f) => (
                <li key={f.month} className="flex items-center justify-between py-2"><span>{monthLabel(f.month)}</span>
                  <span className="text-right"><span className="num font-semibold">{formatBRL(f.total)}</span><span className="block text-xs text-muted">a receber{f.received ? ` · ${formatBRL(f.received)} já recebido` : ""}</span></span></li>))}</ul>
              <p className="mt-3 text-xs text-muted">Total previsto: <b className="num text-fg">{formatBRL(sum(forecast.map((f) => f.total)))}</b></p></Card>
          </div>
          {forecast.map((f) => f.items.length > 0 && (
            <Card key={f.month} pad={false}>
              <div className="flex items-center justify-between p-5 pb-3"><CardHeader title={monthLabel(f.month)} subtitle={`${f.items.length} recebimentos previstos · ${formatBRL(f.total)}`} /></div>
              <ul className="divide-y divide-line border-t border-line">{f.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="w-12 text-sm font-semibold">{formatDate(i.date).slice(0, 5)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{i.label}</span>
                  <Badge tone={i.type === "recorrente" ? "info" : "invest"}>{i.type === "recorrente" ? "Mensalidade" : "Avulso"}</Badge>
                  {i.virtual && <Badge>Previsto pelo contrato</Badge>}
                  <span className="num w-24 text-right text-sm font-medium">{formatBRL(i.amount)}</span>
                  {i.chargeId ? <Button size="sm" onClick={() => setReceiving(d.professionalIncome.find((x) => x.id === i.chargeId)!)}><Check size={14} />Receber</Button> : <span className="w-[84px]" />}
                </li>))}</ul>
            </Card>))}
          {forecast.every((f) => f.items.length === 0) && <Card><EmptyState title="Nada previsto ainda" description="Cadastre clientes com mensalidade ou lance um serviço avulso para ver a previsão." action={<Button variant="primary" onClick={() => setOneOff(true)}>Novo serviço avulso</Button>} /></Card>}
        </div>
      )}

      {tab === "clientes" && (
        <Card pad={false}><div className="overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr className="border-b border-line bg-surface-2/50"><th className="th">Cliente</th><th className="th">Status</th><th className="th text-right">Mensal</th><th className="th">Vence dia</th><th className="th text-right">Receita total</th><th className="th text-right">Custos</th><th className="th text-right">Lucro estimado</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-line">{s.stats.map((x) => (
            <tr key={x.client.id}>
              <td className="td"><p className="font-medium">{x.client.name}</p><p className="text-xs text-muted">{x.client.service}</p></td>
              <td className="td"><Badge tone={STATUS[x.status]}>{x.status}</Badge>{x.overdue > 0 && <p className="mt-0.5 text-[11px] text-expense">{formatBRL(x.overdue)} em atraso</p>}</td>
              <td className="td num text-right">{formatBRL(x.client.monthlyValue)}</td><td className="td">{x.client.dueDay}</td>
              <td className="td num text-right">{formatBRL(x.totalRevenue)}</td><td className="td num text-right text-muted">{formatBRL(x.costs)}</td>
              <td className={`td num text-right font-medium ${x.profit >= 0 ? "text-income" : "text-expense"}`}>{formatBRL(x.profit)}</td>
              <td className="td"><div className="flex justify-end"><IconButton label="Editar cliente" onClick={() => setClient(x.client)}><Pencil size={15} /></IconButton>
                <IconButton label="Excluir cliente" onClick={async () => { if (await confirm({ title: "Excluir cliente?", message: `${x.client.name}: as cobranças pendentes também serão removidas. Recebimentos já lançados são mantidos.`, danger: true, confirmLabel: "Excluir" })) { a.remove("professionalIncome", d.professionalIncome.filter((p) => p.clientId === x.client.id && p.status === "pending").map((p) => p.id)); a.remove("clients", x.client.id); } }}><Trash2 size={15} /></IconButton></div></td>
            </tr>))}</tbody></table></div>
          {s.stats.length === 0 && <EmptyState title="Nenhum cliente cadastrado" />}
        </Card>
      )}

      {tab === "cobrancas" && (
        <Card pad={false}><ul className="divide-y divide-line">{charges.map((p) => {
          const late = isOverdue(p, today);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.description}</p>
                <p className="text-xs text-muted">{clientName(p.clientId)} · vence {formatDate(p.dueDate)}{p.receivedDate ? ` · recebido ${formatDate(p.receivedDate)}` : ""}</p></div>
              <Badge tone={p.status === "received" ? "income" : late ? "expense" : "warn"}>{p.status === "received" ? "Recebido" : late ? `Atrasado ${daysLate(p, today)}d` : "A receber"}</Badge>
              <span className="num w-24 text-right text-sm font-semibold">{formatBRL(p.amount)}</span>
              {p.status === "pending" ? <Button size="sm" onClick={() => setReceiving(p)}><Check size={14} />Receber</Button>
                : <IconButton label="Desfazer recebimento" onClick={() => undoReceive(a, d, p)}><Undo2 size={15} /></IconButton>}
              {p.status === "pending" && <IconButton label="Editar data e valor" onClick={() => setCharge(p)}><Pencil size={15} /></IconButton>}
              {p.status === "pending" && <IconButton label="Excluir cobrança" onClick={() => a.remove("professionalIncome", p.id)}><Trash2 size={15} /></IconButton>}
            </li>);
        })}</ul></Card>
      )}

      {tab === "despesas" && (
        <Card pad={false}><div className="flex items-center justify-between p-5 pb-3"><CardHeader title="Custos, ferramentas, impostos e despesas operacionais" />
          <Button size="sm" onClick={() => openEntry({ entry: "expense" })}><Plus size={14} />Despesa</Button></div>
          <TransactionList txs={proExpenses} compact /></Card>
      )}

      <FormModal open={!!client} onClose={() => setClient(null)} title={client?.id ? "Editar cliente" : "Novo cliente"} fields={clientFields}
        initial={{ name: "", service: "", monthlyValue: 0, dueDay: 10, monthlyCost: 0, status: "ativo", startDate: today, notes: "", ...client }}
        onSubmit={(v) => { a.add("clients", { ...client, ...(v as Partial<Client>), id: client?.id ?? uid() } as Client); setClient(null); }} />
      <FormModal open={!!charge} onClose={() => setCharge(null)} title={charge?.id ? "Editar cobrança" : "Nova cobrança"} fields={chargeFields}
        initial={{ description: "", clientId: "", amount: 0, dueDate: today, type: "avulso", ...charge }}
        onSubmit={(v) => { const x = v as Partial<ProfessionalIncome>; a.add("professionalIncome", { receivedDate: null, status: "pending", accountId: null, ...charge, clientId: x.clientId ?? null, description: x.description!, amount: x.amount!, dueDate: x.dueDate!, type: x.type!, competence: monthOf(x.dueDate!), id: charge?.id ?? uid() } as ProfessionalIncome); setCharge(null); }} />
      <FormModal open={oneOff} onClose={() => setOneOff(false)} title="Novo serviço avulso" description="Trabalho pontual (logo, site, freela…). Lance quando fechar o combinado e informe quando o cliente deve pagar." fields={oneOffFields}
        initial={{ description: "", clientId: "", amount: 0, dueDate: today, installments: 1 }}
        onSubmit={(v) => { const x = v as { description: string; clientId: string | null; amount: number; dueDate: string; installments: number }; createOneOffService(a, { description: x.description, clientId: x.clientId ?? null, amount: x.amount, dueDate: x.dueDate, installments: Number(x.installments) || 1 }); setOneOff(false); setTab("previsao"); }} />
      <Modal open={!!receiving} onClose={() => setReceiving(null)} title="Registrar recebimento" description={receiving?.description} size="sm"
        footer={<><Button onClick={() => setReceiving(null)}>Cancelar</Button><Button variant="primary" disabled={!acc} onClick={() => { receiveCharge(a, d, receiving!, acc, today); setReceiving(null); }}>Confirmar {receiving && formatBRL(receiving.amount)}</Button></>}>
        <Field label="Conta que recebeu"><SelectInput value={acc} onChange={(e) => setAcc(e.target.value)}>{d.accounts.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectInput></Field>
        <p className="mt-3 text-xs text-muted">Gera uma entrada profissional hoje ({formatDate(today)}) e atualiza o saldo da conta.</p>
      </Modal>
    </>
  );
}
