"use client";
import { ArrowLeftRight, CreditCard, LineChart, TrendingDown, TrendingUp } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, MoneyInput, SelectInput, TagsInput, TextArea, TextInput } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { createEntry, updateEntry } from "@/services/commands";
import { valuesFromTransaction, type EntryKind, type EntryValues } from "@/services/transactions";
import type { Frequency, Transaction } from "@/types";
import { cn } from "@/utils/cn";
import { formatBRL } from "@/utils/money";
import { NATURE_LABEL, PAYMENT_LABEL, SCOPE_LABEL } from "@/utils/labels";
import { FREQUENCY_LABEL } from "@/services/schedule";

interface OpenOptions { entry?: EntryKind; edit?: Transaction; duplicate?: Transaction; token?: number }
const Ctx = createContext<(o?: OpenOptions) => void>(() => {});
export const useEntryModal = () => useContext(Ctx);

export function EntryModalProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<OpenOptions | null>(null);
  const open = useCallback((o: OpenOptions = {}) => setOpts({ ...o, token: Date.now() }), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {opts && <EntryModal key={opts.token} opts={opts} onClose={() => setOpts(null)} />}
    </Ctx.Provider>
  );
}

const ENTRY_TABS: { id: EntryKind; label: string; icon: ReactNode; tone: string }[] = [
  { id: "income", label: "Entrada", icon: <TrendingUp size={15} />, tone: "text-income" },
  { id: "expense", label: "Despesa", icon: <TrendingDown size={15} />, tone: "text-expense" },
  { id: "card", label: "Cartão", icon: <CreditCard size={15} />, tone: "text-info" },
  { id: "investment", label: "Investimento", icon: <LineChart size={15} />, tone: "text-invest" },
  { id: "transfer", label: "Transferência", icon: <ArrowLeftRight size={15} />, tone: "text-muted" },
];

const schema = z
  .object({
    entry: z.enum(["income", "expense", "card", "transfer", "investment"]),
    description: z.string().max(120, "Máximo de 120 caracteres"),
    amount: z.number({ error: "Informe o valor" }).int().positive("Informe um valor maior que zero").max(10_000_000_000, "Valor muito alto"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    installments: z.number().int().min(1).max(60, "Máximo de 60 parcelas"),
  })
  .passthrough();

export function EntryModal({ opts, onClose }: { opts: OpenOptions; onClose: () => void }) {
  const d = useData();
  const today = useToday();
  const actions = useActions();
  const editing = opts.edit;
  const src = opts.edit ?? opts.duplicate;

  const initial = useMemo<EntryValues>(() => {
    if (src) {
      const v = valuesFromTransaction(src);
      return opts.duplicate ? { ...v, date: today } : v;
    }
    const acc = d.accounts.find((a) => !a.archived && a.type !== "investimentos" && a.type !== "empresarial") ?? d.accounts[0];
    return {
      entry: opts.entry ?? "expense", description: "", amount: 0, date: today, categoryId: null, subcategoryId: null, accountId: acc?.id ?? null,
      toAccountId: null, cardId: d.creditCards[0]?.id ?? null, investmentId: d.investments[0]?.id ?? null, paymentMethod: "pix",
      nature: "variable", scope: "personal", tags: [], notes: "", recurring: false, frequency: "monthly", installments: 1, paid: true,
    };
  }, [src, opts.duplicate, opts.entry, d.accounts, d.creditCards, d.investments, today]);

  const [v, setV] = useState<EntryValues>(initial);
  const [amountText, setAmountText] = useState<number | null>(initial.amount || null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [more, setMore] = useState(!!src);
  const set = <K extends keyof EntryValues>(k: K, val: EntryValues[K]) => setV((cur) => ({ ...cur, [k]: val }));

  const isTransfer = v.entry === "transfer";
  const isInvest = v.entry === "investment";
  const isCard = v.entry === "card";
  const catKind = v.entry === "income" ? "income" : "expense";
  const roots = d.categories.filter((c) => !c.parentId && c.kind === catKind);
  const subs = d.categories.filter((c) => c.parentId === v.categoryId);
  const accounts = d.accounts.filter((a) => !a.archived);
  const installmentValue = v.installments > 1 && v.amount ? formatBRL(Math.floor(v.amount / v.installments)) : null;

  const pickCategory = (id: string) => {
    const cat = d.categories.find((c) => c.id === id);
    setV((cur) => ({ ...cur, categoryId: id || null, subcategoryId: null, nature: cat ? cat.nature : cur.nature }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const parsed = schema.safeParse({ ...v, amount: amountText ?? undefined });
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
    if (isTransfer) {
      if (!v.accountId) errs.accountId = "Escolha a conta de origem";
      if (!v.toAccountId) errs.toAccountId = "Escolha a conta de destino";
      if (v.accountId && v.accountId === v.toAccountId) errs.toAccountId = "Origem e destino devem ser diferentes";
    } else if (isInvest) {
      if (!v.investmentId) errs.investmentId = "Escolha o investimento";
      if (!v.accountId) errs.accountId = "Escolha a conta de origem";
    } else if (isCard) {
      if (!v.cardId) errs.cardId = "Escolha o cartão";
      if (!v.description.trim()) errs.description = "Descreva a compra";
    } else {
      if (!v.description.trim()) errs.description = "Informe uma descrição";
      if (!v.accountId) errs.accountId = "Escolha a conta";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const inv = d.investments.find((i) => i.id === v.investmentId);
    const from = accounts.find((a) => a.id === v.accountId);
    const to = accounts.find((a) => a.id === v.toAccountId);
    const values: EntryValues = {
      ...v, amount: amountText!, scope: isTransfer || isInvest ? (from?.type === "empresarial" ? "professional" : "personal") : v.scope,
      description: v.description.trim() || (isInvest ? `Aporte — ${inv?.name ?? ""}` : isTransfer ? `Transferência ${from?.name} → ${to?.name}` : ""),
    };
    if (editing) updateEntry(actions, d, editing, values, today);
    else createEntry(actions, d, values, today);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={editing ? "Editar movimentação" : opts.duplicate ? "Duplicar movimentação" : "Nova movimentação"} size="md">
      <form onSubmit={submit} noValidate className="space-y-4">
        {!editing && (
          <div className="grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Tipo de movimentação">
            {ENTRY_TABS.map((t) => (
              <button
                key={t.id} type="button" role="tab" aria-selected={v.entry === t.id}
                onClick={() => { set("entry", t.id); setErrors({}); if (t.id === "income") setV((c) => ({ ...c, entry: t.id, nature: "variable", categoryId: null, subcategoryId: null })); }}
                className={cn("flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition sm:text-xs", v.entry === t.id ? "bg-surface shadow-card " + t.tone : "text-muted hover:text-fg")}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Valor" error={errors.amount}>
            <MoneyInput value={amountText} onChange={(c) => { setAmountText(c); set("amount", c ?? 0); }} aria-label="Valor" />
          </Field>
          <Field label="Data" error={errors.date}>
            <TextInput type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
          </Field>

          {isInvest ? (
            <Field label="Investimento" error={errors.investmentId} className="sm:col-span-2">
              <SelectInput value={v.investmentId ?? ""} onChange={(e) => set("investmentId", e.target.value || null)}>
                <option value="">Selecione…</option>
                {d.investments.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.institution}</option>)}
              </SelectInput>
            </Field>
          ) : (
            <Field label={isTransfer ? "Descrição (opcional)" : "Descrição"} error={errors.description} className="sm:col-span-2">
              <TextInput value={v.description} onChange={(e) => set("description", e.target.value)} placeholder={isCard ? "Ex.: Notebook, mercado, passagem…" : v.entry === "income" ? "Ex.: Salário, projeto avulso…" : "Ex.: Aluguel, farmácia…"} maxLength={120} />
            </Field>
          )}

          {!isTransfer && !isInvest && (
            <>
              <Field label="Categoria">
                <SelectInput value={v.categoryId ?? ""} onChange={(e) => pickCategory(e.target.value)}>
                  <option value="">Sem categoria</option>
                  {roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              </Field>
              <Field label="Subcategoria">
                <SelectInput value={v.subcategoryId ?? ""} disabled={!subs.length} onChange={(e) => set("subcategoryId", e.target.value || null)}>
                  <option value="">{subs.length ? "Nenhuma" : "—"}</option>
                  {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectInput>
              </Field>
            </>
          )}

          {isCard ? (
            <Field label="Cartão" error={errors.cardId}>
              <SelectInput value={v.cardId ?? ""} onChange={(e) => set("cardId", e.target.value || null)}>
                <option value="">Selecione…</option>
                {d.creditCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectInput>
            </Field>
          ) : (
            <Field label={isTransfer || isInvest ? "Conta de origem" : "Conta"} error={errors.accountId}>
              <SelectInput value={v.accountId ?? ""} onChange={(e) => set("accountId", e.target.value || null)}>
                <option value="">Selecione…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </SelectInput>
            </Field>
          )}

          {isTransfer && (
            <Field label="Conta de destino" error={errors.toAccountId}>
              <SelectInput value={v.toAccountId ?? ""} onChange={(e) => set("toAccountId", e.target.value || null)}>
                <option value="">Selecione…</option>
                {accounts.filter((a) => a.id !== v.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </SelectInput>
            </Field>
          )}

          {v.entry === "expense" && (
            <Field label="Forma de pagamento">
              <SelectInput value={v.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value as EntryValues["paymentMethod"])}>
                {(["pix", "debito", "dinheiro", "boleto", "transferencia", "outro"] as const).map((k) => <option key={k} value={k}>{PAYMENT_LABEL[k]}</option>)}
              </SelectInput>
            </Field>
          )}
          {v.entry === "income" && (
            <Field label="Recebimento">
              <SelectInput value={v.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value as EntryValues["paymentMethod"])}>
                {(["pix", "transferencia", "dinheiro", "boleto", "outro"] as const).map((k) => <option key={k} value={k}>{PAYMENT_LABEL[k]}</option>)}
              </SelectInput>
            </Field>
          )}

          {(isCard || v.entry === "expense") && !editing && (
            <Field label="Parcelas" error={errors.installments} hint={installmentValue ? `${v.installments}x de ${installmentValue}` : "1 = à vista"}>
              <TextInput type="number" min={1} max={60} value={v.installments} onChange={(e) => set("installments", Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
            </Field>
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(v.entry === "income" || v.entry === "expense") && (
            <Checkbox checked={v.paid} onChange={(c) => set("paid", c)} label={v.entry === "income" ? "Já recebido" : "Já pago"} />
          )}
          {(isCard || v.entry === "income" || v.entry === "expense") && !editing && v.installments <= 1 && (
            <Checkbox checked={v.recurring} onChange={(c) => set("recurring", c)} label="Recorrente" />
          )}
        </div>
        {v.recurring && !editing && (
          <Field label="Frequência">
            <SelectInput value={v.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)}>
              {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
            </SelectInput>
          </Field>
        )}

        {!isTransfer && !isInvest && (
          <>
            <button type="button" onClick={() => setMore((m) => !m)} className="text-xs font-medium text-brand hover:underline">
              {more ? "Ocultar detalhes" : "Mais detalhes (tags, observações, pessoal/profissional)"}
            </button>
            {more && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Pessoal ou profissional">
                  <SelectInput value={v.scope} onChange={(e) => set("scope", e.target.value as EntryValues["scope"])}>
                    {(Object.keys(SCOPE_LABEL) as (keyof typeof SCOPE_LABEL)[]).map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Tipo de despesa" hint="Fixa, variável ou eventual">
                  <SelectInput value={v.nature} onChange={(e) => set("nature", e.target.value as EntryValues["nature"])}>
                    {(Object.keys(NATURE_LABEL) as (keyof typeof NATURE_LABEL)[]).map((s) => <option key={s} value={s}>{NATURE_LABEL[s]}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Tags" className="sm:col-span-2"><TagsInput value={v.tags} onChange={(t) => set("tags", t)} /></Field>
                <Field label="Observações" className="sm:col-span-2"><TextArea value={v.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} /></Field>
              </div>
            )}
          </>
        )}

        {isTransfer && <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">Transferências movem dinheiro entre contas e não contam como receita nem despesa.</p>}
        {isCard && <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">Compras no cartão entram na fatura correspondente. O saldo da conta só muda quando você paga a fatura, sem duplicar a despesa.</p>}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit">{editing ? "Salvar alterações" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
