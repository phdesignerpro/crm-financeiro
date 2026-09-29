"use client";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { TransactionList } from "@/components/transactions/TransactionList";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { ACCOUNT_ICONS, iconFor } from "@/components/ui/icons";
import { useActions, useData } from "@/hooks/useStore";
import { accountBalance, cashBalance, totalAccountsBalance } from "@/services/finance";
import { accountHasHistory } from "@/services/commands";
import type { Account, AccountType } from "@/types";
import { uid } from "@/utils/id";
import { ACCOUNT_TYPE_LABEL } from "@/utils/labels";
import { formatBRL } from "@/utils/money";

const FIELDS: FieldDef[] = [
  { name: "institution", label: "Instituição", type: "text", required: true, placeholder: "Ex.: Nubank" },
  { name: "name", label: "Nome da conta", type: "text", required: true, placeholder: "Ex.: Conta Nubank" },
  { name: "type", label: "Tipo", type: "select", required: true, options: (Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((v) => ({ value: v, label: ACCOUNT_TYPE_LABEL[v] })) },
  { name: "initialBalance", label: "Saldo inicial", type: "money", required: true, allowZero: true, hint: "Saldo antes dos lançamentos registrados. O saldo atual é calculado." },
  { name: "color", label: "Cor", type: "color" },
  { name: "icon", label: "Ícone", type: "select", required: true, options: Object.keys(ACCOUNT_ICONS).map((k) => ({ value: k, label: k })) },
];

export default function ContasPage() {
  const d = useData();
  const a = useActions();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const accounts = d.accounts;
  const list = accounts.filter((x) => !x.archived);
  const archived = accounts.filter((x) => x.archived);
  const selectedTx = useMemo(() => d.transactions.filter((t) => t.accountId === selected || t.toAccountId === selected).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 20), [d.transactions, selected]);

  const remove = async (acc: Account) => {
    if (accountHasHistory(d, acc.id)) {
      if (await confirm({ title: "Arquivar conta?", message: "Esta conta possui movimentações ou cartões vinculados, então será arquivada (o histórico é preservado).", confirmLabel: "Arquivar" }))
        a.patch("accounts", acc.id, { archived: true });
    } else if (await confirm({ title: "Excluir conta?", message: `"${acc.name}" será excluída definitivamente.`, confirmLabel: "Excluir", danger: true })) a.remove("accounts", acc.id);
  };

  return (
    <>
      <PageHeader title="Contas" description="Saldo individual e consolidado das suas contas, carteiras e contas empresariais."
        actions={<Button variant="primary" onClick={() => setEditing({})}><Plus size={15} />Nova conta</Button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="!p-4"><p className="text-xs text-muted">Saldo consolidado</p><p className="num mt-1 text-2xl font-semibold">{formatBRL(totalAccountsBalance(d))}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Disponível em contas (sem investimentos)</p><p className="num mt-1 text-2xl font-semibold text-info">{formatBRL(cashBalance(d))}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Contas ativas</p><p className="num mt-1 text-2xl font-semibold">{list.length}</p></Card>
      </div>

      {list.length === 0 ? <Card><EmptyState title="Nenhuma conta cadastrada" description="Cadastre sua primeira conta para começar a registrar movimentações." action={<Button variant="primary" onClick={() => setEditing({})}>Nova conta</Button>} /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((acc) => {
            const Icon = iconFor(acc.icon);
            const bal = accountBalance(acc, d.transactions);
            return (
              <div key={acc.id} onClick={() => setSelected(acc.id === selected ? null : acc.id)} role="button" tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelected(acc.id === selected ? null : acc.id)}
                className={`card cursor-pointer p-5 transition hover:shadow-pop ${selected === acc.id ? "ring-2 ring-brand/40" : ""}`}>
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: acc.color }}><Icon size={19} /></span>
                  <div className="flex" onClick={(e) => e.stopPropagation()}>
                    <IconButton label="Editar conta" onClick={() => setEditing(acc)}><Pencil size={15} /></IconButton>
                    <IconButton label="Excluir ou arquivar conta" onClick={() => remove(acc)}><Trash2 size={15} /></IconButton>
                  </div>
                </div>
                <p className="mt-4 text-sm font-medium">{acc.name}</p>
                <p className="text-xs text-muted">{acc.institution}</p>
                <p className={`num mt-3 text-2xl font-semibold ${bal < 0 ? "text-expense" : ""}`}>{formatBRL(bal)}</p>
                <div className="mt-2"><Badge>{ACCOUNT_TYPE_LABEL[acc.type]}</Badge></div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <Card pad={false} className="mt-6">
          <div className="p-5 pb-0"><CardHeader title={`Últimas movimentações — ${accounts.find((x) => x.id === selected)?.name}`} /></div>
          {selectedTx.length ? <TransactionList txs={selectedTx} compact /> : <EmptyState title="Sem movimentações nesta conta" />}
        </Card>
      )}

      {archived.length > 0 && (
        <Card className="mt-6"><CardHeader title="Contas arquivadas" />
          <ul className="divide-y divide-line">{archived.map((x) => (
            <li key={x.id} className="flex items-center justify-between py-2 text-sm"><span>{x.name} <span className="text-muted">· {x.institution}</span></span>
              <Button size="sm" onClick={() => a.patch("accounts", x.id, { archived: false })}><Archive size={14} />Restaurar</Button></li>
          ))}</ul></Card>
      )}

      <FormModal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar conta" : "Nova conta"} fields={FIELDS}
        initial={{ institution: "", name: "", type: "corrente", initialBalance: 0, color: "#6366f1", icon: "wallet", ...editing }}
        onSubmit={(v) => { a.add("accounts", { archived: false, ...editing, ...(v as Partial<Account>), id: editing?.id ?? uid() } as Account); setEditing(null); }} />
    </>
  );
}
