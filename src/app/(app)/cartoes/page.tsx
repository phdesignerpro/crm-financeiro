"use client";
import { CreditCard as CardIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { SimpleBars } from "@/components/charts/ChartKit";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, EmptyState, ProgressBar } from "@/components/ui/Feedback";
import { Field, MoneyInput, SelectInput, TextInput } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { anticipateInstallments, cancelInstallments, futureInstallments, payInvoice } from "@/services/commands";
import { cardSummary, type CardSummary, type Invoice } from "@/services/finance";
import { addMonthsKey, formatDate, monthLabel, monthShort } from "@/utils/date";
import type { CreditCard, InstallmentPlan } from "@/types";
import { allTransactions } from "@/services/schedule";
import { formatBRL, formatPct } from "@/utils/money";
import { uid } from "@/utils/id";

const day = (label: string, name: string): FieldDef => ({ name, label, type: "number", required: true, min: 1, max: 31 });
const FIELDS = (accounts: { id: string; name: string }[]): FieldDef[] => [
  { name: "bank", label: "Banco", type: "text", required: true },
  { name: "name", label: "Nome do cartão", type: "text", required: true },
  { name: "limit", label: "Limite", type: "money", required: true },
  day("Dia de fechamento", "closingDay"), day("Dia de vencimento", "dueDay"),
  { name: "accountId", label: "Conta usada para pagamento", type: "select", required: true, options: accounts.map((a) => ({ value: a.id, label: a.name })) },
  { name: "color", label: "Cor", type: "color" },
];

const LEVELS = [90, 70, 50, 30];
const STATUS_TONE = { aberta: "info", fechada: "warn", paga: "income", atrasada: "expense" } as const;

export default function CartoesPage() {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Partial<CreditCard> | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ card: CreditCard; inv: Invoice } | null>(null);
  const [tab, setTab] = useState<"faturas" | "parcelas">("faturas");
  const [antic, setAntic] = useState<InstallmentPlan | null>(null);

  const future = useMemo(() => allTransactions(d, `${addMonthsKey(today.slice(0, 7), 8)}-28`), [d, today]);
  const summaries = useMemo(() => d.creditCards.map((c) => cardSummary(d, c, today, future)), [d, today, future]);
  const real = useMemo(() => d.creditCards.map((c) => cardSummary(d, c, today)), [d, today]);
  const cardId = sel ?? d.creditCards[0]?.id ?? null;
  const s = summaries.find((x) => x.card.id === cardId);
  const sReal = real.find((x) => x.card.id === cardId);
  const bankAccounts = d.accounts.filter((x) => !x.archived);

  const chart = (x: CardSummary) => Array.from({ length: 6 }, (_, i) => {
    const key = addMonthsKey(x.current.key, i);
    return { label: monthShort(key), value: x.invoices.find((v) => v.key === key)?.total ?? 0 };
  });
  const plans = d.installments.filter((p) => p.cardId === cardId && p.status === "active");

  return (
    <>
      <PageHeader title="Cartões de Crédito" description="Faturas, limite, compras parceladas e próximas cobranças."
        actions={<Button variant="primary" onClick={() => setEditing({})}><Plus size={15} />Novo cartão</Button>} />

      {d.creditCards.length === 0 ? <Card><EmptyState icon={<CardIcon />} title="Nenhum cartão cadastrado" action={<Button variant="primary" onClick={() => setEditing({})}>Novo cartão</Button>} /></Card> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {real.map((x) => {
              const level = LEVELS.find((l) => x.usedPct >= l);
              return (
                <div key={x.card.id} onClick={() => setSel(x.card.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(x.card.id)}
                  className={`card cursor-pointer overflow-hidden p-5 transition hover:shadow-pop ${cardId === x.card.id ? "ring-2 ring-brand/40" : ""}`}>
                  <div className="flex items-start justify-between">
                    <div><p className="font-semibold">{x.card.name}</p><p className="text-xs text-muted">{x.card.bank} · fecha dia {x.card.closingDay} · vence dia {x.card.dueDay}</p></div>
                    <div className="flex" onClick={(e) => e.stopPropagation()}>
                      <IconButton label="Editar cartão" onClick={() => setEditing(x.card)}><Pencil size={15} /></IconButton>
                      <IconButton label="Excluir cartão" onClick={async () => {
                        if (d.transactions.some((t) => t.cardId === x.card.id)) return void (await confirm({ title: "Cartão com lançamentos", message: "Este cartão possui compras registradas e não pode ser excluído. Exclua ou mova as compras antes.", confirmLabel: "Entendi" }));
                        if (await confirm({ title: "Excluir cartão?", message: x.card.name, danger: true, confirmLabel: "Excluir" })) a.remove("creditCards", x.card.id);
                      }}><Trash2 size={15} /></IconButton>
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <div><p className="text-xs text-muted">Fatura atual</p><p className="num text-xl font-semibold">{formatBRL(x.current.total - x.current.paid)}</p></div>
                    <div className="text-right"><p className="text-xs text-muted">Disponível</p><p className="num text-sm font-medium text-income">{formatBRL(x.available)}</p></div>
                  </div>
                  <ProgressBar className="mt-3" value={x.usedPct} tone={x.usedPct >= 70 ? "expense" : x.usedPct >= 50 ? "warn" : "info"} label="Limite utilizado" />
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span>{formatBRL(x.used)} de {formatBRL(x.card.limit)} ({formatPct(x.usedPct, 0)})</span>
                    {level && <Badge tone={level >= 70 ? "expense" : "warn"}>{level}% do limite</Badge>}
                  </div>
                </div>
              );
            })}
          </div>

          {s && sReal && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <Card pad={false}>
                <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
                  <CardHeader title={s.card.name} subtitle={`${formatBRL(sReal.futureInstallments)} em parcelas futuras`} />
                  <Tabs value={tab} onChange={setTab} items={[{ id: "faturas", label: "Faturas" }, { id: "parcelas", label: "Parcelamentos" }]} />
                </div>
                {tab === "faturas" ? (
                  <ul className="divide-y divide-line border-t border-line">
                    {sReal.invoices.filter((i) => i.key >= addMonthsKey(s.current.key, -3)).reverse().map((inv) => (
                      <li key={inv.key} className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{monthLabel(inv.key)}</p>
                            <p className="text-xs text-muted">Fecha {formatDate(inv.closingDate)} · vence {formatDate(inv.dueDate)} · {inv.items.length} compras</p>
                          </div>
                          <Badge tone={STATUS_TONE[inv.status]}>{inv.status}</Badge>
                          <p className="num w-24 text-right text-sm font-semibold">{formatBRL(inv.total)}</p>
                          {inv.remaining > 0 && (inv.status !== "aberta" || inv.key === s.current.key) && <Button size="sm" onClick={() => setPaying({ card: s.card, inv })}>Pagar</Button>}
                        </div>
                        <details className="mt-1"><summary className="cursor-pointer text-xs text-brand">Ver compras</summary>
                          <ul className="mt-2 space-y-1 text-xs">{inv.items.map((t) => (
                            <li key={t.id} className="flex justify-between gap-2 text-muted"><span className="truncate">{formatDate(t.date)} · {t.description}{t.installmentNumber ? ` (${t.installmentNumber}/${t.installmentCount})` : ""}</span><span className="num text-fg">{formatBRL(t.amount)}</span></li>
                          ))}</ul></details>
                      </li>
                    ))}
                    {sReal.invoices.length === 0 && <li><EmptyState title="Sem faturas ainda" /></li>}
                  </ul>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {plans.length === 0 && <li><EmptyState title="Nenhuma compra parcelada ativa" description="Use “Nova movimentação → Cartão” com mais de 1 parcela." /></li>}
                    {plans.map((p) => {
                      const rows = d.transactions.filter((t) => t.installmentId === p.id);
                      const left = futureInstallments(d, p.id, today);
                      return (
                        <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.description}</p>
                            <p className="text-xs text-muted">{p.count}x de {formatBRL(rows[1]?.amount ?? rows[0]?.amount ?? 0)} · {left.length} restantes ({formatBRL(left.reduce((sum, t) => sum + t.amount, 0))})</p>
                            <ProgressBar className="mt-1.5 !h-1.5" value={((p.count - left.length) / p.count) * 100} tone="info" /></div>
                          <Button size="sm" disabled={!left.length} onClick={() => setAntic(p)}>Antecipar</Button>
                          <Button size="sm" variant="danger" disabled={!left.length} onClick={async () => { if (await confirm({ title: "Cancelar parcelas futuras?", message: `As ${left.length} parcelas restantes de "${p.description}" serão removidas das próximas faturas.`, confirmLabel: "Cancelar parcelas", danger: true })) cancelInstallments(a, d, p, today); }}>Cancelar</Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <div className="space-y-6">
                <Card><CardHeader title="Próximas faturas" subtitle="Inclui parcelas e assinaturas previstas" /><SimpleBars data={chart(s)} color="info" name="Fatura" />
                  <ul className="mt-2 space-y-1 text-sm">{chart(s).map((r, i) => <li key={i} className="flex justify-between"><span className="text-muted">{monthLabel(addMonthsKey(s.current.key, i)).split(" de ")[0]}</span><span className="num font-medium">{formatBRL(r.value)}</span></li>)}</ul></Card>
              </div>
            </div>
          )}
        </>
      )}

      <FormModal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar cartão" : "Novo cartão"} fields={FIELDS(bankAccounts)}
        initial={{ bank: "", name: "", limit: 0, closingDay: 25, dueDay: 5, accountId: bankAccounts[0]?.id ?? "", color: "#6366f1", ...editing }}
        onSubmit={(v) => { a.add("creditCards", { ...editing, ...(v as Partial<CreditCard>), id: editing?.id ?? uid() } as CreditCard); setEditing(null); }} />

      {paying && <PayModal {...paying} onClose={() => setPaying(null)} />}
      {antic && <AnticipateModal plan={antic} onClose={() => setAntic(null)} />}
    </>
  );
}

function PayModal({ card, inv, onClose }: { card: CreditCard; inv: Invoice; onClose: () => void }) {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const [amount, setAmount] = useState<number | null>(inv.remaining);
  const [acc, setAcc] = useState(card.accountId ?? d.accounts[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const err = !amount || amount <= 0 ? "Informe o valor" : amount > inv.remaining ? "Maior que o saldo da fatura" : "";
  return (
    <Modal open onClose={onClose} title={`Pagar fatura — ${card.name}`} description={`${monthLabel(inv.key)} · restante ${formatBRL(inv.remaining)}`} size="sm"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!!err || !acc} onClick={() => {
        payInvoice(a, card, inv.key, amount!, acc, date, card.name.includes("PJ") ? "professional" : "personal"); onClose();
      }}>Confirmar pagamento</Button></>}>
      <div className="space-y-4">
        <Field label="Valor" error={err}><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Pagar com a conta"><SelectInput value={acc} onChange={(e) => setAcc(e.target.value)}>{d.accounts.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectInput></Field>
        <Field label="Data"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">O pagamento apenas move dinheiro da conta para o cartão. As compras já foram contabilizadas como despesa, então nada é contado em dobro.</p>
      </div>
    </Modal>
  );
}

function AnticipateModal({ plan, onClose }: { plan: InstallmentPlan; onClose: () => void }) {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const left = futureInstallments(d, plan.id, today);
  const [count, setCount] = useState(Math.min(1, left.length));
  const [disc, setDisc] = useState(0);
  const total = left.slice(0, count).reduce((s, t) => s + t.amount, 0);
  return (
    <Modal open onClose={onClose} title={`Antecipar — ${plan.description}`} size="sm"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={count < 1} onClick={() => { anticipateInstallments(a, d, plan, count, disc, today); onClose(); }}>Antecipar</Button></>}>
      <div className="space-y-4">
        <Field label={`Quantas parcelas (máx. ${left.length})`}><TextInput type="number" min={1} max={left.length} value={count} onChange={(e) => setCount(Math.max(1, Math.min(left.length, Number(e.target.value) || 1)))} /></Field>
        <Field label="Desconto obtido (%)" hint="Informe se o banco abateu juros na antecipação."><TextInput type="number" min={0} max={90} value={disc} onChange={(e) => setDisc(Math.max(0, Math.min(90, Number(e.target.value) || 0)))} /></Field>
        <p className="text-sm">Valor a antecipar: <b className="num">{formatBRL(Math.round(total * (1 - disc / 100)))}</b></p>
      </div>
    </Modal>
  );
}
