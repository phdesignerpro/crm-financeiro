"use client";
import { ArrowLeftRight, Check, Copy, CreditCard, LineChart, Pencil, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { useEntryModal } from "@/components/forms/EntryModal";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/Confirm";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { deleteEntry, duplicateEntry, markPaid, type DeleteScope } from "@/services/commands";
import type { Transaction } from "@/types";
import { cn } from "@/utils/cn";
import { formatDate } from "@/utils/date";
import { formatBRL } from "@/utils/money";
import { PAYMENT_LABEL } from "@/utils/labels";

export function useTxActions() {
  const d = useData();
  const a = useActions();
  const today = useToday();
  const confirm = useConfirm();
  const openEntry = useEntryModal();
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

  const remove = async (t: Transaction) => {
    if (t.installmentId) return setPendingDelete(t);
    if (await confirm({ title: "Excluir movimentação?", message: `"${t.description}" será removida e os saldos serão recalculados.`, confirmLabel: "Excluir", danger: true }))
      deleteEntry(a, d, t, "one");
  };
  const dialog = (
    <Modal open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Excluir parcela" size="sm" description={pendingDelete?.description}>
      <div className="flex flex-col gap-2">
        {([["one", "Somente esta parcela"], ["future", "Esta e as próximas parcelas"], ["all", "Todas as parcelas da compra"]] as [DeleteScope, string][]).map(([s, label]) => (
          <Button key={s} variant={s === "one" ? "secondary" : "danger"} onClick={() => { deleteEntry(a, d, pendingDelete!, s); setPendingDelete(null); }}>{label}</Button>
        ))}
      </div>
    </Modal>
  );
  return {
    dialog, remove,
    edit: (t: Transaction) => openEntry({ edit: t }),
    duplicate: (t: Transaction) => openEntry({ duplicate: t }),
    quickDuplicate: (t: Transaction) => duplicateEntry(a, t, today),
    togglePaid: (t: Transaction) => markPaid(a, t, t.status !== "paid"),
  };
}

export function TransactionList({ txs, compact }: { txs: Transaction[]; compact?: boolean }) {
  const d = useData();
  const today = useToday();
  const act = useTxActions();
  const catName = (t: Transaction) => {
    const c = d.categories.find((x) => x.id === t.categoryId);
    const s = d.categories.find((x) => x.id === t.subcategoryId);
    return c ? (s ? `${c.name} · ${s.name}` : c.name) : t.kind === "transfer" ? "Transferência" : t.kind === "invoice_payment" ? "Pagamento de fatura" : t.kind === "investment" ? "Investimento" : "Sem categoria";
  };
  const catColor = (t: Transaction) => d.categories.find((x) => x.id === t.categoryId)?.color ?? "#94a3b8";
  const accName = (id: string | null) => d.accounts.find((a) => a.id === id)?.name;
  const cardName = (id: string | null) => d.creditCards.find((c) => c.id === id)?.name;

  return (
    <>
      <ul className="divide-y divide-line">
        {txs.map((t) => {
          const income = t.kind === "income";
          const neutral = t.kind === "transfer" || t.kind === "invoice_payment" || t.kind === "investment";
          const late = t.status === "pending" && !t.cardId && t.date < today;
          return (
            <li key={t.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: catColor(t) + "22", color: catColor(t) }}>
                {t.kind === "transfer" ? <ArrowLeftRight size={16} /> : t.kind === "investment" ? <LineChart size={16} /> : t.cardId ? <CreditCard size={16} /> : <span className="text-sm font-semibold">{(t.description[0] ?? "?").toUpperCase()}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {t.description}
                  {t.installmentNumber && <span className="ml-1.5 text-xs font-normal text-muted">{t.installmentNumber}/{t.installmentCount}</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {formatDate(t.date)} · {catName(t)} · {t.kind === "transfer" ? `${accName(t.accountId)} → ${accName(t.toAccountId)}` : t.cardId ? cardName(t.cardId) : `${accName(t.accountId) ?? "—"} · ${PAYMENT_LABEL[t.paymentMethod]}`}
                  {t.scope === "professional" && " · PJ"}
                </p>
                {!compact && t.tags.length > 0 && <p className="mt-0.5 truncate text-xs text-info">{t.tags.map((x) => `#${x}`).join(" ")}</p>}
              </div>
              {t.status === "pending" && !t.cardId && <Badge tone={late ? "expense" : "warn"}>{late ? "Atrasada" : "Pendente"}</Badge>}
              {t.status === "pending" && t.cardId && <Badge tone="neutral">Futura</Badge>}
              <p className={cn("num w-28 shrink-0 text-right text-sm font-semibold", income ? "text-income" : neutral ? "text-muted" : "text-expense")}>
                {income ? "+" : neutral ? "" : "−"}{formatBRL(Math.abs(t.amount))}
              </p>
              <div className="hidden shrink-0 items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 sm:flex">
                {!t.cardId && (t.kind === "income" || t.kind === "expense") && (
                  <IconButton label={t.status === "paid" ? "Marcar como pendente" : income ? "Marcar como recebido" : "Marcar como pago"} onClick={() => act.togglePaid(t)}>
                    {t.status === "paid" ? <Undo2 size={15} /> : <Check size={15} />}
                  </IconButton>
                )}
                <IconButton label="Editar" onClick={() => act.edit(t)}><Pencil size={15} /></IconButton>
                <IconButton label="Duplicar" onClick={() => act.duplicate(t)}><Copy size={15} /></IconButton>
                <IconButton label="Excluir" onClick={() => act.remove(t)}><Trash2 size={15} /></IconButton>
              </div>
              <div className="flex shrink-0 sm:hidden">
                <IconButton label="Editar" onClick={() => act.edit(t)}><Pencil size={15} /></IconButton>
                <IconButton label="Excluir" onClick={() => act.remove(t)}><Trash2 size={15} /></IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      {act.dialog}
    </>
  );
}
