"use client";
import { Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, EmptyState, ProgressBar, type Tone } from "@/components/ui/Feedback";
import { Field, MoneyInput } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { goalStatus } from "@/services/planning";
import type { Goal, GoalCategory } from "@/types";
import { addMonths, formatDate } from "@/utils/date";
import { uid } from "@/utils/id";
import { GOAL_LABEL, PRIORITY_LABEL } from "@/utils/labels";
import { formatBRL, formatPct, sum } from "@/utils/money";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Nome da meta", type: "text", required: true, placeholder: "Ex.: Viagem ao Japão" },
  { name: "category", label: "Categoria", type: "select", required: true, options: (Object.keys(GOAL_LABEL) as GoalCategory[]).map((k) => ({ value: k, label: GOAL_LABEL[k] })) },
  { name: "target", label: "Valor objetivo", type: "money", required: true },
  { name: "current", label: "Valor atual", type: "money", required: true, allowZero: true },
  { name: "deadline", label: "Prazo", type: "date", required: true },
  { name: "monthly", label: "Aporte mensal planejado", type: "money", required: true, allowZero: true },
  { name: "priority", label: "Prioridade", type: "select", required: true, options: (Object.keys(PRIORITY_LABEL) as (keyof typeof PRIORITY_LABEL)[]).map((k) => ({ value: k, label: PRIORITY_LABEL[k] })) },
];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  concluida: { label: "Concluída", tone: "income" }, no_prazo: { label: "No prazo", tone: "info" }, atrasada: { label: "Atrasada", tone: "warn" }, sem_aporte: { label: "Sem aporte", tone: "warn" },
};

export default function MetasPage() {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);
  const [deposit, setDeposit] = useState<Goal | null>(null);
  const [amt, setAmt] = useState<number | null>(null);
  const order = { alta: 0, media: 1, baixa: 2 };
  const goals = [...d.goals].sort((x, y) => order[x.priority] - order[y.priority]).map((g) => goalStatus(g, today));

  return (
    <>
      <PageHeader title="Metas financeiras" description="Acompanhe objetivos e veja quanto guardar por mês para chegar no prazo."
        actions={<Button variant="primary" onClick={() => setEditing({})}><Plus size={15} />Nova meta</Button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="!p-4"><p className="text-xs text-muted">Total acumulado nas metas</p><p className="num mt-1 text-2xl font-semibold text-invest">{formatBRL(sum(d.goals.map((g) => g.current)))}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Falta para concluir todas</p><p className="num mt-1 text-2xl font-semibold">{formatBRL(sum(goals.map((g) => g.remaining)))}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Aporte mensal planejado</p><p className="num mt-1 text-2xl font-semibold">{formatBRL(sum(d.goals.filter((g) => g.current < g.target).map((g) => g.monthly)))}</p></Card>
      </div>
      {goals.length === 0 ? <Card><EmptyState title="Nenhuma meta criada" action={<Button variant="primary" onClick={() => setEditing({})}>Nova meta</Button>} /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((s) => {
            const g = s.goal;
            const st = STATUS[s.status];
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold">{g.name}</p><p className="text-xs text-muted">{GOAL_LABEL[g.category]} · prioridade {PRIORITY_LABEL[g.priority].toLowerCase()} · prazo {formatDate(g.deadline)}</p></div>
                  <div className="flex items-center gap-1"><Badge tone={st.tone}>{st.label}</Badge>
                    <IconButton label="Editar meta" onClick={() => setEditing(g)}><Pencil size={15} /></IconButton>
                    <IconButton label="Excluir meta" onClick={async () => { if (await confirm({ title: "Excluir meta?", message: g.name, danger: true, confirmLabel: "Excluir" })) a.remove("goals", g.id); }}><Trash2 size={15} /></IconButton></div>
                </div>
                <div className="mt-4 flex items-end justify-between"><p className="num text-xl font-semibold">{formatBRL(g.current)}</p><p className="num text-sm text-muted">de {formatBRL(g.target)}</p></div>
                <ProgressBar className="mt-2" value={s.pct} tone={s.status === "concluida" ? "income" : s.status === "atrasada" ? "warn" : "invest"} label={`Progresso de ${g.name}`} />
                <p className="mt-1.5 text-xs text-muted">{formatPct(s.pct, 0)} concluída · faltam {formatBRL(s.remaining)}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3 text-xs">
                  <div><dt className="text-muted">Guardar por mês para o prazo</dt><dd className="num mt-0.5 text-sm font-semibold">{formatBRL(s.requiredMonthly)}</dd></div>
                  <div><dt className="text-muted">Aporte planejado</dt><dd className="num mt-0.5 text-sm font-semibold">{formatBRL(g.monthly)}</dd></div>
                  <div className="col-span-2 text-muted">{s.status === "concluida" ? "Meta atingida." : s.etaMonths != null ? `Com o aporte atual, conclui em ~${s.etaMonths} meses (${formatDate(addMonths(today, s.etaMonths))}). Faltam ${s.monthsLeft} meses até o prazo.` : "Defina um aporte mensal para estimar a conclusão."}</div>
                </dl>
                {s.status !== "concluida" && <Button className="mt-3" size="sm" onClick={() => { setAmt(g.monthly || null); setDeposit(g); }}><PiggyBank size={14} />Registrar aporte</Button>}
              </Card>
            );
          })}
        </div>
      )}
      <FormModal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar meta" : "Nova meta"} fields={FIELDS}
        initial={{ name: "", category: "viagem", target: 0, current: 0, deadline: addMonths(today, 12), monthly: 0, priority: "media", ...editing }}
        onSubmit={(v) => { a.add("goals", { createdAt: new Date().toISOString(), ...editing, ...(v as Partial<Goal>), id: editing?.id ?? uid() } as Goal); setEditing(null); }} />
      <Modal open={!!deposit} onClose={() => setDeposit(null)} title={`Aporte — ${deposit?.name ?? ""}`} size="sm"
        footer={<><Button onClick={() => setDeposit(null)}>Cancelar</Button><Button variant="primary" disabled={!amt} onClick={() => { a.patch("goals", deposit!.id, { current: deposit!.current + amt! }); setDeposit(null); }}>Registrar</Button></>}>
        <Field label="Valor do aporte"><MoneyInput value={amt} onChange={setAmt} /></Field>
      </Modal>
    </>
  );
}
