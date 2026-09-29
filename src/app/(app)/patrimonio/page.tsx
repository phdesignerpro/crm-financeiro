"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AreaTrend, Donut, Legend2 } from "@/components/charts/ChartKit";
import { FormModal, type FieldDef } from "@/components/forms/EntityForm";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { PageHeader } from "@/components/ui/PageHeader";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { closeMonth } from "@/services/commands";
import { netWorth, netWorthHistory } from "@/services/networth";
import type { Asset, Liability } from "@/types";
import { monthShortYear } from "@/utils/date";
import { uid } from "@/utils/id";
import { ASSET_LABEL, LIABILITY_LABEL } from "@/utils/labels";
import { formatBRL } from "@/utils/money";

const assetFields: FieldDef[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "type", label: "Tipo", type: "select", required: true, options: Object.entries(ASSET_LABEL).map(([value, label]) => ({ value, label })) },
  { name: "value", label: "Valor", type: "money", required: true, allowZero: true },
];
const liabFields: FieldDef[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "type", label: "Tipo", type: "select", required: true, options: Object.entries(LIABILITY_LABEL).map(([value, label]) => ({ value, label })) },
  { name: "balance", label: "Saldo devedor", type: "money", required: true, allowZero: true },
  { name: "monthlyPayment", label: "Parcela mensal", type: "money", required: true, allowZero: true },
];

export default function PatrimonioPage() {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const confirm = useConfirm();
  const nw = netWorth(d, today);
  const hist = netWorthHistory(d, today, 12);
  const [asset, setAsset] = useState<Partial<Asset> | null>(null);
  const [liab, setLiab] = useState<Partial<Liability> | null>(null);
  const A = nw.assets, L = nw.liabilities;
  const assetRows: [string, number, string][] = [["Saldo em contas", A.cash, "#2563eb"], ["Investimentos", A.investments, "#7c3aed"], ["Imóveis", A.property, "#0d9488"], ["Veículos", A.vehicles, "#f59e0b"], ["Outros bens", A.other, "#94a3b8"], ["Valores a receber", A.receivables, "#16a34a"]];
  const liabRows: [string, number][] = [["Financiamentos", L.financing], ["Empréstimos", L.loans], ["Dívidas", L.debts], ["Cartões (faturas e parcelas)", L.cards], ["Valores a pagar", L.payable]];

  return (
    <>
      <PageHeader title="Patrimônio" description="Ativos menos passivos e a evolução mês a mês."
        actions={<Button onClick={() => closeMonth(a, d, today)}>Registrar fechamento do mês</Button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="!p-4"><p className="text-xs text-muted">Patrimônio líquido</p><p className="num mt-1 text-2xl font-semibold text-invest">{formatBRL(nw.net)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Total de ativos</p><p className="num mt-1 text-2xl font-semibold text-income">{formatBRL(nw.totalAssets)}</p></Card>
        <Card className="!p-4"><p className="text-xs text-muted">Total de passivos</p><p className="num mt-1 text-2xl font-semibold text-expense">{formatBRL(nw.totalLiabilities)}</p></Card>
      </div>
      <Card className="mb-6"><CardHeader title="Evolução patrimonial" subtitle="Fechamentos mensais + mês atual ao vivo" />
        <AreaTrend color="invest" name="Patrimônio líquido" data={hist.map((p) => ({ label: monthShortYear(p.month), value: p.net }))} /></Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ativos" action={<Button size="sm" onClick={() => setAsset({})}><Plus size={14} />Adicionar bem</Button>} />
          <div className="grid items-center gap-4 sm:grid-cols-2"><Donut height={180} data={assetRows.filter(([, v]) => v > 0).map(([name, value, color]) => ({ name, value, color }))} />
            <Legend2 items={assetRows.map(([name, value, color]) => ({ name, value: formatBRL(value), color }))} /></div>
          <ul className="mt-4 divide-y divide-line border-t border-line">{d.assets.map((x) => (
            <li key={x.id} className="flex items-center justify-between py-2 text-sm"><span>{x.name} <span className="text-xs text-muted">· {ASSET_LABEL[x.type]}</span></span>
              <span className="flex items-center"><span className="num font-medium">{formatBRL(x.value)}</span><IconButton label="Editar" onClick={() => setAsset(x)}><Pencil size={14} /></IconButton>
                <IconButton label="Excluir" onClick={async () => { if (await confirm({ title: "Excluir bem?", message: x.name, danger: true, confirmLabel: "Excluir" })) a.remove("assets", x.id); }}><Trash2 size={14} /></IconButton></span></li>))}</ul>
          <p className="mt-2 text-xs text-muted">Contas, investimentos e recebíveis profissionais entram automaticamente.</p>
        </Card>
        <Card>
          <CardHeader title="Passivos" action={<Button size="sm" onClick={() => setLiab({})}><Plus size={14} />Adicionar passivo</Button>} />
          <ul className="space-y-2 text-sm">{liabRows.map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="num font-medium">{formatBRL(v)}</span></li>)}</ul>
          <ul className="mt-4 divide-y divide-line border-t border-line">{d.liabilities.map((x) => (
            <li key={x.id} className="flex items-center justify-between py-2 text-sm"><span>{x.name} <span className="text-xs text-muted">· {LIABILITY_LABEL[x.type]} · parcela {formatBRL(x.monthlyPayment)}</span></span>
              <span className="flex items-center"><span className="num font-medium">{formatBRL(x.balance)}</span><IconButton label="Editar" onClick={() => setLiab(x)}><Pencil size={14} /></IconButton>
                <IconButton label="Excluir" onClick={async () => { if (await confirm({ title: "Excluir passivo?", message: x.name, danger: true, confirmLabel: "Excluir" })) a.remove("liabilities", x.id); }}><Trash2 size={14} /></IconButton></span></li>))}</ul>
        </Card>
      </div>

      <FormModal open={!!asset} onClose={() => setAsset(null)} title={asset?.id ? "Editar bem" : "Novo bem"} fields={assetFields} initial={{ name: "", type: "veiculo", value: 0, ...asset }}
        onSubmit={(v) => { a.add("assets", { ...asset, ...(v as Partial<Asset>), id: asset?.id ?? uid() } as Asset); setAsset(null); }} />
      <FormModal open={!!liab} onClose={() => setLiab(null)} title={liab?.id ? "Editar passivo" : "Novo passivo"} fields={liabFields} initial={{ name: "", type: "financiamento", balance: 0, monthlyPayment: 0, ...liab }}
        onSubmit={(v) => { a.add("liabilities", { ...liab, ...(v as Partial<Liability>), id: liab?.id ?? uid() } as Liability); setLiab(null); }} />
    </>
  );
}
