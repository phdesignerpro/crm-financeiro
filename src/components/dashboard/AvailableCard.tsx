"use client";
import { Card } from "@/components/ui/Card";
import type { AvailableBreakdown } from "@/services/commitments";
import { cn } from "@/utils/cn";
import { formatBRL } from "@/utils/money";

export function AvailableCard({ a }: { a: AvailableBreakdown }) {
  const rows: [string, number][] = [
    ["Contas a pagar", a.bills], ["Despesas programadas", a.scheduled], ["Faturas de cartão", a.cards],
    ["Parcelas do período", a.installments], ["Investimentos programados", a.investments], ["Reserva de emergência", a.reserve],
    ["Impostos reservados", a.taxes],
  ];
  const negative = a.available < 0;
  return (
    <Card className="relative overflow-hidden">
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Disponível de verdade</p>
          <p className={cn("num mt-2 text-4xl font-semibold tracking-tight sm:text-5xl", negative ? "text-expense" : "text-income")}>{formatBRL(a.available)}</p>
          <p className="mt-2 max-w-md text-sm text-muted">
            Quanto você pode gastar sem comprometer contas, faturas, aportes e impostos dos próximos {a.horizonDays} dias.
            Seu saldo em conta é {formatBRL(a.balance)}, mas {formatBRL(a.totalCommitted)} já têm destino.
          </p>
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between font-medium"><dt>Saldo atual</dt><dd className="num">{formatBRL(a.balance)}</dd></div>
          {rows.filter(([, v]) => v > 0).map(([k, v]) => (
            <div key={k} className="flex justify-between text-muted"><dt>{k}</dt><dd className="num text-expense">−{formatBRL(v)}</dd></div>
          ))}
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Disponível</dt><dd className={cn("num", negative ? "text-expense" : "text-income")}>{formatBRL(a.available)}</dd></div>
        </dl>
      </div>
    </Card>
  );
}
