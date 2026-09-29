"use client";
import { Lightbulb, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge, type Tone } from "@/components/ui/Feedback";
import { TextInput } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { useData, useToday } from "@/hooks/useStore";
import { answer, SUGGESTIONS, type AssistantReply } from "@/services/assistant";
import { healthIndicators, healthSummary, type HealthStatus } from "@/services/health";
import { generateInsights, type Tone as InsightTone } from "@/services/insights";
import { cn } from "@/utils/cn";

type Tab = "insights" | "saude" | "assistente";
const TONE_DOT: Record<InsightTone, string> = { positive: "bg-income", negative: "bg-expense", warning: "bg-warn", info: "bg-info" };
const H_TONE: Record<HealthStatus, { tone: Tone; label: string; bar: string }> = {
  good: { tone: "income", label: "Saudável", bar: "bg-income" }, warn: { tone: "warn", label: "Atenção", bar: "bg-warn" },
  bad: { tone: "expense", label: "Crítico", bar: "bg-expense" }, neutral: { tone: "neutral", label: "Sem dados", bar: "bg-muted" },
};

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("insights");
  return (
    <>
      <PageHeader title="Insights financeiros" description="Análises geradas a partir dos seus dados reais, indicadores de saúde financeira e um assistente para perguntas." />
      <Tabs className="mb-6" value={tab} onChange={setTab} items={[{ id: "insights", label: "Insights" }, { id: "saude", label: "Saúde financeira" }, { id: "assistente", label: "Assistente" }]} />
      {tab === "insights" && <Insights />}
      {tab === "saude" && <Health />}
      {tab === "assistente" && <Assistant />}
    </>
  );
}

function Insights() {
  const d = useData();
  const today = useToday();
  const list = useMemo(() => generateInsights(d, today), [d, today]);
  const areas = [...new Set(list.map((i) => i.area))];
  return (
    <div className="space-y-6">
      {areas.map((area) => (
        <section key={area}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{area}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {list.filter((i) => i.area === area).map((i) => (
              <Card key={i.id} className="!p-4">
                <div className="flex gap-3"><span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[i.tone])} />
                  <div><p className="text-sm leading-relaxed">{i.text}</p>{i.href && <Link href={i.href} className="mt-1 inline-block text-xs font-medium text-brand hover:underline">Ver detalhes</Link>}</div></div>
              </Card>
            ))}
          </div>
        </section>
      ))}
      {list.length === 0 && <Card><p className="py-8 text-center text-sm text-muted"><Lightbulb className="mx-auto mb-2" />Cadastre movimentações para gerar insights.</p></Card>}
    </div>
  );
}

function Health() {
  const d = useData();
  const today = useToday();
  const ind = useMemo(() => healthIndicators(d, today), [d, today]);
  const sum = healthSummary(ind);
  return (
    <>
      <Card className="mb-6 !p-4"><p className="text-sm">Dos <b>{sum.total}</b> indicadores avaliados: <Badge tone="income">{sum.good} saudáveis</Badge> <Badge tone="warn">{sum.warn} em atenção</Badge> <Badge tone="expense">{sum.bad} críticos</Badge></p>
        <p className="mt-2 text-xs text-muted">Não existe uma nota única: cada indicador é mostrado separadamente, com sua explicação. Taxas usam a média dos 3 últimos meses fechados.</p></Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ind.map((i) => { const t = H_TONE[i.status]; return (
          <Card key={i.id}>
            <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{i.label}</p><Badge tone={t.tone}>{t.label}</Badge></div>
            <p className="num mt-3 text-2xl font-semibold tracking-tight">{i.display}</p>
            <div className={cn("mt-3 h-1 w-10 rounded-full", t.bar)} />
            <p className="mt-3 text-sm text-muted">{i.meaning}</p><p className="mt-2 text-xs text-muted/80">{i.reference}</p>
          </Card>); })}
      </div>
    </>
  );
}

interface Msg { role: "user" | "bot"; text: string; reply?: AssistantReply }

function Assistant() {
  const d = useData();
  const today = useToday();
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: "Olá! Posso responder sobre seus gastos, cartões, metas e projeções usando seus dados reais. Pergunte algo ou escolha uma sugestão." }]);
  const [q, setQ] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [msgs]);
  const send = (text: string) => {
    if (!text.trim()) return;
    const reply = answer(text, d, today);
    setMsgs((m) => [...m, { role: "user", text }, { role: "bot", text: reply.text, reply }]);
    setQ("");
  };
  return (
    <Card pad={false} className="mx-auto max-w-3xl">
      <div className="max-h-[60vh] min-h-[320px] space-y-4 overflow-y-auto p-5" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" && "justify-end")}>
            <div className={cn("max-w-[88%] rounded-2xl px-4 py-2.5 text-sm", m.role === "user" ? "bg-brand text-white" : "bg-surface-2")}>
              {m.reply?.verdict && <Badge className="mb-2" tone={m.reply.verdict === "ok" ? "income" : m.reply.verdict === "warn" ? "warn" : "expense"}>{m.reply.verdict === "ok" ? "Cabe no orçamento" : m.reply.verdict === "warn" ? "Cabe, mas apertado" : "Não recomendado agora"}</Badge>}
              <p>{m.text}</p>
              {m.reply?.sections?.map((s) => (
                <div key={s.title} className="mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.title}</p>
                  <ul className="mt-1 space-y-0.5 text-[13px]">{s.lines.map((l, j) => <li key={j}>{l}</li>)}</ul></div>))}
            </div>
          </div>))}
        <div ref={end} />
      </div>
      <div className="border-t border-line p-4">
        <div className="mb-3 flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:bg-surface-2 hover:text-fg">{s}</button>)}</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pergunte sobre suas finanças…" aria-label="Pergunta" />
          <Button variant="primary" type="submit" aria-label="Enviar"><Send size={16} /></Button>
        </form>
        <p className="mt-2 text-[11px] text-muted">As respostas vêm de cálculos sobre seus dados cadastrados; não são recomendação de investimento.</p>
      </div>
    </Card>
  );
}
