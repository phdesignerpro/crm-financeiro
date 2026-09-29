"use client";
import { Wand2 } from "lucide-react";
import { useState } from "react";
import { AreaTrend } from "@/components/charts/ChartKit";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, ProgressBar } from "@/components/ui/Feedback";
import { Field, MoneyInput, TextInput } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { emergencyStatus, estimateEssentialMonthly, RESERVE_OPTIONS } from "@/services/planning";
import { formatDate, monthShort } from "@/utils/date";
import { uid } from "@/utils/id";
import { formatBRL, formatPct } from "@/utils/money";
import { cn } from "@/utils/cn";

export default function ReservaPage() {
  const d = useData();
  const today = useToday();
  const a = useActions();
  const r = emergencyStatus(d, today);
  const suggested = estimateEssentialMonthly(d, today);
  const [entry, setEntry] = useState<{ sign: 1 | -1 } | null>(null);
  const [amt, setAmt] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const entries = [...d.emergencyEntries].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 12);

  return (
    <>
      <PageHeader title="Reserva de emergência" description="Defina seu custo essencial e acompanhe a meta de 3, 6, 9 ou 12 meses."
        actions={<><Button onClick={() => { setAmt(null); setNote(""); setEntry({ sign: -1 }); }}>Registrar resgate</Button><Button variant="primary" onClick={() => { setAmt(d.emergencyFund.monthlyContribution || null); setNote("Aporte"); setEntry({ sign: 1 }); }}>Registrar aporte</Button></>} />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-4">
            <div><p className="text-xs text-muted">Reserva atual</p><p className="num mt-1 text-xl font-semibold text-info">{formatBRL(r.current)}</p></div>
            <div><p className="text-xs text-muted">Meta ({r.targetMonths} meses)</p><p className="num mt-1 text-xl font-semibold">{formatBRL(r.target)}</p></div>
            <div><p className="text-xs text-muted">Concluído</p><p className="num mt-1 text-xl font-semibold">{formatPct(r.pct, 0)}</p></div>
            <div><p className="text-xs text-muted">Falta</p><p className="num mt-1 text-xl font-semibold">{formatBRL(r.missing)}</p></div>
          </div>
          <ProgressBar className="mt-5 !h-3" value={r.pct} tone={r.pct >= 100 ? "income" : "info"} label="Progresso da reserva" />
          <p className="mt-3 text-sm text-muted">
            Você tem <b className="text-fg">{r.monthsCovered.toFixed(1).replace(".", ",")} meses</b> de custo essencial guardados.{" "}
            {r.missing === 0 ? "Meta atingida!" : r.etaMonths != null ? <>Com aportes de {formatBRL(r.monthlyContribution)}/mês, a meta deve ser concluída em ~<b className="text-fg">{r.etaMonths} meses</b> ({formatDate(r.etaDate)}).</> : "Defina um aporte mensal para estimar a conclusão."}
          </p>
        </Card>

        <Card>
          <CardHeader title="Configuração" />
          <div className="space-y-3">
            <Field label="Custo mensal essencial" hint={suggested ? <>Média dos gastos essenciais (3 meses): {formatBRL(suggested)} <button className="ml-1 inline-flex items-center gap-1 text-brand hover:underline" onClick={() => a.setEmergencyFund({ essentialMonthly: suggested })}><Wand2 size={11} />usar</button></> : undefined}>
              <MoneyInput value={d.emergencyFund.essentialMonthly} onChange={(v) => a.setEmergencyFund({ essentialMonthly: v ?? 0 })} />
            </Field>
            <Field label="Aporte mensal na reserva"><MoneyInput value={d.emergencyFund.monthlyContribution} onChange={(v) => a.setEmergencyFund({ monthlyContribution: v ?? 0 })} /></Field>
            <Field label="Onde está guardada"><TextInput value={d.emergencyFund.location} onChange={(e) => a.setEmergencyFund({ location: e.target.value })} placeholder="Ex.: Tesouro Selic, CDB liquidez diária" /></Field>
          </div>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold">Escolha sua meta</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {r.options.map((o) => {
          const sel = o.months === r.targetMonths;
          const pct = o.amount ? Math.min(100, (r.current / o.amount) * 100) : 0;
          return (
            <button key={o.months} type="button" onClick={() => a.setEmergencyFund({ targetMonths: o.months as 3 | 6 | 9 | 12 })}
              className={cn("card p-4 text-left transition hover:shadow-pop", sel && "ring-2 ring-brand/50")} aria-pressed={sel}>
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">{o.months} meses</p>{pct >= 100 && <Badge tone="income">Atingida</Badge>}</div>
              <p className="num mt-1 text-lg font-semibold">{formatBRL(o.amount)}</p>
              <ProgressBar className="mt-2 !h-1.5" value={pct} tone={pct >= 100 ? "income" : "info"} />
              <p className="mt-1 text-xs text-muted">{formatPct(pct, 0)}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Evolução da reserva" subtitle="Últimos 12 meses" /><AreaTrend color="info" name="Reserva" data={r.history.map((h) => ({ label: monthShort(h.month), value: h.balance }))} /></Card>
        <Card pad={false}><div className="p-5 pb-2"><CardHeader title="Aportes e resgates" /></div>
          <ul className="divide-y divide-line">{entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm"><span>{formatDate(e.date)} <span className="text-muted">· {e.note}</span></span>
              <span className={cn("num font-medium", e.amount >= 0 ? "text-income" : "text-expense")}>{e.amount >= 0 ? "+" : "−"}{formatBRL(Math.abs(e.amount))}</span></li>
          ))}</ul></Card>
      </div>
      <p className="mt-4 text-xs text-muted">A reserva é uma separação dentro do seu patrimônio (contas ou investimentos): ela não soma em duplicidade no patrimônio líquido.</p>

      <Modal open={!!entry} onClose={() => setEntry(null)} title={entry?.sign === 1 ? "Registrar aporte na reserva" : "Registrar resgate da reserva"} size="sm"
        footer={<><Button onClick={() => setEntry(null)}>Cancelar</Button><Button variant="primary" disabled={!amt} onClick={() => { a.add("emergencyEntries", { id: uid(), date, amount: amt! * entry!.sign, note: note || (entry!.sign === 1 ? "Aporte" : "Resgate") }); setEntry(null); }}>Salvar</Button></>}>
        <div className="space-y-4"><Field label="Valor"><MoneyInput value={amt} onChange={setAmt} /></Field>
          <Field label="Data"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Observação"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      </Modal>
    </>
  );
}
