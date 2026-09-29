import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { toneSoft, toneText, type Tone } from "./Feedback";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  /** Variação percentual (positivo/negativo). */
  delta?: number | null;
  /** true quando o aumento é ruim (ex.: despesas). */
  invertDelta?: boolean;
  deltaLabel?: string;
  hint?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, tone = "neutral", icon, delta, invertDelta, deltaLabel = "vs. mês anterior", hint, className }: StatCardProps) {
  const good = delta == null ? null : invertDelta ? delta <= 0 : delta >= 0;
  return (
    <div className={cn("card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", toneSoft(tone))}>{icon}</span>}
      </div>
      <p className={cn("num mt-2 truncate text-xl font-semibold tracking-tight sm:text-[22px]", tone !== "neutral" && toneText(tone))}>{value}</p>
      {delta != null && (
        <p className="mt-1 text-xs">
          <span className={cn("font-medium", good ? "text-income" : "text-expense")}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1).replace(".", ",")}%
          </span>{" "}
          <span className="text-muted">{deltaLabel}</span>
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
