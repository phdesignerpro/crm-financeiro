"use client";
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, EmptyState, type Tone } from "@/components/ui/Feedback";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { useData, useToday } from "@/hooks/useStore";
import { upcomingCommitments, type EventType } from "@/services/commitments";
import { formatDateShort, relativeDays } from "@/utils/date";
import { formatBRL, sum } from "@/utils/money";

export const EVENT_LABEL: Record<EventType, { label: string; tone: Tone }> = {
  bill: { label: "Conta", tone: "expense" }, subscription: { label: "Assinatura", tone: "invest" }, installment: { label: "Parcela", tone: "warn" },
  invoice: { label: "Fatura", tone: "info" }, income: { label: "Entrada", tone: "income" }, professional: { label: "Recebimento", tone: "income" },
  investment: { label: "Investimento", tone: "invest" }, reserve: { label: "Reserva", tone: "invest" }, goal: { label: "Meta", tone: "invest" },
  tax: { label: "Imposto", tone: "warn" }, variable: { label: "Variável", tone: "neutral" },
};

export function Upcoming() {
  const d = useData();
  const today = useToday();
  const [days, setDays] = useState<"7" | "15" | "30">("7");
  const list = useMemo(() => upcomingCommitments(d, today, Number(days)), [d, today, days]);
  return (
    <Card>
      <CardHeader title="Próximos compromissos" subtitle={`${list.length} ${list.length === 1 ? "item" : "itens"} · ${formatBRL(sum(list.map((e) => e.amount)))} nos próximos ${days} dias`}
        action={<Tabs value={days} onChange={setDays} items={[{ id: "7", label: "7 dias" }, { id: "15", label: "15 dias" }, { id: "30", label: "30 dias" }]} />} />
      {list.length === 0 ? <EmptyState icon={<CalendarClock />} title="Nada a vencer neste período" /> : (
        <ul className="divide-y divide-line">
          {list.slice(0, 10).map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <div className="w-12 shrink-0 text-center">
                <p className="text-sm font-semibold">{formatDateShort(e.date)}</p>
                <p className={`text-[10px] ${e.overdue ? "font-medium text-expense" : "text-muted"}`}>{e.overdue ? "atrasada" : relativeDays(e.date, today)}</p>
              </div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{e.label}</p></div>
              <Badge tone={EVENT_LABEL[e.type].tone}>{EVENT_LABEL[e.type].label}</Badge>
              <p className="num w-24 text-right text-sm font-medium">{formatBRL(e.amount)}</p>
            </li>
          ))}
        </ul>
      )}
      {list.length > 10 && <Link href="/planejamento" className="mt-3 block text-center text-xs font-medium text-brand hover:underline">Ver todos no calendário</Link>}
    </Card>
  );
}
