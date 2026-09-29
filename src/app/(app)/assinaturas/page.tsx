"use client";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { saveSubscription } from "@/services/commands";
import { FREQUENCY_LABEL, annualEquivalent, monthlyEquivalent, occurrences } from "@/services/schedule";
import { pctChange } from "@/services/finance";
import type { Frequency, Subscription } from "@/types";
import { addDays, formatDate, relativeDays } from "@/utils/date";
import { formatBRL, formatPct, sum } from "@/utils/money";
import { SCOPE_LABEL } from "@/utils/labels";

export default function AssinaturasPage() {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Partial<Subscription> | null>(null);
  const active = d.subscriptions.filter((s) => s.active);
  const monthly = sum(active.map((s) => monthlyEquivalent(s.amount, s.frequency)));
  const annual = sum(active.map((s) => annualEquivalent(s.amount, s.frequency)));
  const pro = sum(active.filter((s) => s.scope === "professional").map((s) => monthlyEquivalent(s.amount, s.frequency)));
  const next = (s: Subscription) => occurrences(s, addDays(today, 0), addDays(today, 400))[0] ?? null;
  const cat = (id: string | null) => d.categories.find((c) => c.id === id)?.name ?? "—";
  const source = (s: Subscription) => d.creditCards.find((c) => c.id === s.cardId)?.name ?? d.accounts.find((x) => x.id === s.accountId)?.name ?? "—";

  const fields: FieldDef[] = [
    { name: "name", label: "Serviço", type: "text", required: true, placeholder: "Ex.: Adobe Creative Cloud" },
    { name: "amount", label: "Valor", type: "money", required: true },
    { name: "frequency", label: "Frequência", type: "select", required: true, options: (Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => ({ value: f, label: FREQUENCY_LABEL[f] })) },
    { name: "startDate", label: "Data de cobrança (âncora)", type: "date", required: true, hint: "As próximas cobranças seguem esta data." },
    { name: "cardId", label: "Cartão", type: "select", nullable: true, placeholder: "Nenhum (cobrança na conta)", options: d.creditCards.map((c) => ({ value: c.id, label: c.name })) },
    { name: "accountId", label: "Conta", type: "select", nullable: true, placeholder: "—", options: d.accounts.filter((x) => !x.archived).map((c) => ({ value: c.id, label: c.name })) },
    { name: "categoryId", label: "Categoria", type: "select", nullable: true, options: d.categories.filter((c) => !c.parentId && c.kind === "expense").map((c) => ({ value: c.id, label: c.name })) },
    { name: "scope", label: "Pessoal ou profissional", type: "select", required: true, options: [{ value: "personal", label: "Pessoal" }, { value: "professional", label: "Profissional" }] },
    { name: "usage", label: "Frequência de uso", type: "select", nullable: true, placeholder: "Não informado", options: [{ value: "alto", label: "Alto" }, { value: "medio", label: "Médio" }, { value: "baixo", label: "Baixo (pouco utilizada)" }] },
    { name: "endDate", label: "Encerra em (opcional)", type: "date" },
  ];

  return (
    <>
      <PageHeader title="Assinaturas" description="Cobranças recorrentes pessoais e profissionais."
        actions={<Button variant="primary" onClick={() => setEditing({})}><Plus size={15} />Nova assinatura</Button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="!p-4"><p className="text-xs text-muted">Assinaturas mensais</p><p className="num mt-1 text-2xl font-semibold">{formatBRL(monthly)}</p><p className="text-xs text-muted">{active.length} ativas</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Custo anual estimado</p><p className="num mt-1 text-2xl font-semibold text-invest">{formatBRL(annual)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Parte profissional / mês</p><p className="num mt-1 text-2xl font-semibold">{formatBRL(pro)}</p><p className="text-xs text-muted">Pessoal: {formatBRL(monthly - pro)}</p></Card>
      </div>

      <Card pad={false}>
        {d.subscriptions.length === 0 ? <EmptyState title="Nenhuma assinatura cadastrada" action={<Button variant="primary" onClick={() => setEditing({})}>Nova assinatura</Button>} /> : (
          <ul className="divide-y divide-line">
            {[...d.subscriptions].sort((x, y) => monthlyEquivalent(y.amount, y.frequency) - monthlyEquivalent(x.amount, x.frequency)).map((s) => {
              const n = next(s);
              const up = s.previousAmount && s.previousAmount < s.amount;
              return (
                <li key={s.id} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${s.active ? "" : "opacity-50"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted">{FREQUENCY_LABEL[s.frequency]} · {source(s)} · {cat(s.categoryId)} · {SCOPE_LABEL[s.scope]}{n && s.active ? ` · próxima ${formatDate(n)} (${relativeDays(n, today)})` : ""}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {up && <Badge tone="warn"><AlertTriangle size={11} />Reajuste de {formatPct(pctChange(s.amount, s.previousAmount!), 0)}</Badge>}
                      {s.usage === "baixo" && <Badge tone="warn"><AlertTriangle size={11} />Pouco utilizada</Badge>}
                    </div>
                  </div>
                  <div className="text-right"><p className="num text-sm font-semibold">{formatBRL(s.amount)}</p><p className="num text-xs text-muted">{formatBRL(annualEquivalent(s.amount, s.frequency))}/ano</p></div>
                  <div className="flex">
                    <Button size="sm" variant="ghost" onClick={() => a.patch("subscriptions", s.id, { active: !s.active })}>{s.active ? "Pausar" : "Reativar"}</Button>
                    <IconButton label="Editar" onClick={() => setEditing(s)}><Pencil size={15} /></IconButton>
                    <IconButton label="Excluir" onClick={async () => { if (await confirm({ title: "Excluir assinatura?", message: `${s.name} deixará de ser projetada. Lançamentos passados são mantidos.`, danger: true, confirmLabel: "Excluir" })) a.remove("subscriptions", s.id); }}><Trash2 size={15} /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="mt-6"><CardHeader title="Como o sistema usa suas assinaturas" />
        <p className="text-sm text-muted">Cada cobrança vencida vira uma despesa (no cartão ou na conta) e as próximas entram automaticamente em faturas, calendário, “Disponível de verdade” e projeção de caixa. Marque o uso como “baixo” para receber sugestões de cancelamento.</p></Card>

      <FormModal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar assinatura" : "Nova assinatura"} fields={fields}
        initial={{ name: "", amount: 0, frequency: "monthly", startDate: today, cardId: d.creditCards[0]?.id ?? "", accountId: "", categoryId: d.categories.find((c) => c.name === "Assinaturas")?.id ?? "", scope: "personal", usage: "", endDate: "", ...editing }}
        onSubmit={(v) => {
          const x = v as Record<string, unknown>;
          const card = d.creditCards.find((c) => c.id === x.cardId);
          saveSubscription(a, {
            name: x.name as string, amount: x.amount as number, frequency: x.frequency as Frequency, startDate: x.startDate as string, endDate: (x.endDate as string) || null,
            active: editing?.active ?? true, cardId: (x.cardId as string) ?? null, accountId: ((x.accountId as string) ?? card?.accountId) ?? null,
            categoryId: (x.categoryId as string) ?? null, scope: x.scope as Subscription["scope"], usage: (x.usage as Subscription["usage"]) ?? null,
          }, d.subscriptions.find((s) => s.id === editing?.id), today);
          setEditing(null);
        }} />
    </>
  );
}
