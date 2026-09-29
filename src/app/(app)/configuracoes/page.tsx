"use client";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { useTheme } from "@/components/layout/ThemeProvider";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Field, MoneyInput, Segmented, TextInput } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { useActions, useAppState, useData } from "@/hooks/useStore";
import { deleteCategory } from "@/services/commands";
import type { Category } from "@/types";
import { NATURE_LABEL } from "@/utils/labels";
import { uid } from "@/utils/id";
import { cn } from "@/utils/cn";

export default function ConfiguracoesPage() {
  const d = useData();
  const st = useAppState();
  const a = useActions();
  const confirm = useConfirm();
  const { mode, setMode } = useTheme();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const roots = d.categories.filter((c) => !c.parentId && c.kind === kind);

  const fields: FieldDef[] = [
    { name: "name", label: "Nome", type: "text", required: true },
    { name: "parentId", label: "Subcategoria de", type: "select", nullable: true, placeholder: "— (categoria principal)", options: d.categories.filter((c) => !c.parentId && c.kind === kind && c.id !== editing?.id).map((c) => ({ value: c.id, label: c.name })) },
    { name: "nature", label: "Tipo de despesa", type: "select", required: true, options: Object.entries(NATURE_LABEL).map(([value, label]) => ({ value, label })), hint: "Fixa, variável ou eventual" },
    { name: "color", label: "Cor", type: "color" },
    { name: "essential", label: "Custo essencial (conta para a reserva de emergência)", type: "checkbox", span: 2 },
  ];

  return (
    <>
      <PageHeader title="Configurações" description="Preferências, categorias e dados do sistema." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Aparência" />
          <Segmented value={mode} onChange={setMode} options={[{ value: "system", label: "Automático" }, { value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }]} /></Card>
        <Card><CardHeader title="Parâmetros financeiros" subtitle="Usados no “Disponível de verdade” e nas projeções" />
          <div className="space-y-3">
            <Field label="Aporte mensal programado em investimentos"><MoneyInput value={d.settings.monthlyInvestmentPlan} onChange={(v) => a.setSettings({ monthlyInvestmentPlan: v ?? 0 })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Imposto reservado sobre receita profissional (%)"><TextInput type="number" min={0} max={60} step={0.5} value={d.settings.taxRatePct} onChange={(e) => a.setSettings({ taxRatePct: Math.min(60, Math.max(0, Number(e.target.value) || 0)) })} /></Field>
              <Field label="Horizonte de compromissos (dias)"><TextInput type="number" min={7} max={90} value={d.settings.horizonDays} onChange={(e) => a.setSettings({ horizonDays: Math.min(90, Math.max(7, Math.floor(Number(e.target.value)) || 30)) })} /></Field>
            </div></div></Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Categorias e subcategorias" action={<Button size="sm" variant="primary" onClick={() => setEditing({ kind })}><Plus size={14} />Nova</Button>} />
        <Tabs className="mb-4" value={kind} onChange={setKind} items={[{ id: "expense", label: "Despesas" }, { id: "income", label: "Receitas" }]} />
        <ul className="divide-y divide-line">{roots.map((c) => {
          const subs = d.categories.filter((s) => s.parentId === c.id);
          return (
            <li key={c.id} className="py-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} aria-label="Expandir subcategorias" className="text-muted"><ChevronRight size={15} className={cn("transition", open === c.id && "rotate-90")} /></button>
                <span className="h-3 w-3 rounded-full" style={{ background: c.color }} /><span className="flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted">{NATURE_LABEL[c.nature]}{c.essential ? " · essencial" : ""}{subs.length ? ` · ${subs.length} sub` : ""}</span>
                <IconButton label="Adicionar subcategoria" onClick={() => setEditing({ kind, parentId: c.id, nature: c.nature, color: c.color, essential: c.essential })}><Plus size={14} /></IconButton>
                <IconButton label="Editar categoria" onClick={() => setEditing(c)}><Pencil size={14} /></IconButton>
                <IconButton label="Excluir categoria" onClick={async () => { if (await confirm({ title: "Excluir categoria?", message: `${c.name}${subs.length ? " e suas subcategorias" : ""} serão removidas; movimentações ficam sem categoria.`, danger: true, confirmLabel: "Excluir" })) deleteCategory(a, d, c.id); }}><Trash2 size={14} /></IconButton>
              </div>
              {open === c.id && subs.length > 0 && <ul className="ml-9 mt-1 space-y-1">{subs.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm"><span className="flex-1 text-muted">{s.name}</span>
                  <IconButton label="Editar subcategoria" onClick={() => setEditing(s)}><Pencil size={13} /></IconButton>
                  <IconButton label="Excluir subcategoria" onClick={() => deleteCategory(a, d, s.id)}><Trash2 size={13} /></IconButton></li>))}</ul>}
            </li>);
        })}</ul>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Dados" subtitle={st.mode === "local" ? "Modo demonstração: dados salvos apenas neste navegador." : `Conta: ${st.userEmail}`} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={async () => { if (await confirm({ title: "Carregar dados de demonstração?", message: "Substitui todos os dados atuais por dados fictícios.", confirmLabel: "Carregar" })) a.loadDemo(); }}>Carregar dados de demonstração</Button>
          <Button variant="danger" onClick={async () => { if (await confirm({ title: "Apagar todos os dados?", message: "Remove contas, movimentações, cartões, metas e demais registros. Esta ação não pode ser desfeita.", confirmLabel: "Apagar tudo", danger: true })) a.clearAll(); }}>Apagar todos os dados</Button>
        </div>
        <p className="mt-3 text-xs text-muted">Preparado para integrações bancárias futuras: as movimentações têm origem, conta e status, prontos para receber lançamentos importados.</p>
      </Card>

      <FormModal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar categoria" : editing?.parentId ? "Nova subcategoria" : "Nova categoria"} fields={fields}
        initial={{ name: "", parentId: "", nature: "variable", color: "#6366f1", essential: false, ...editing }}
        onSubmit={(v) => { const x = v as Partial<Category>; a.add("categories", { kind, ...editing, ...x, parentId: x.parentId ?? null, id: editing?.id ?? uid() } as Category); setEditing(null); }} />
    </>
  );
}
