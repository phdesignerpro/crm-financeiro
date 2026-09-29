import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export type Tone = "neutral" | "income" | "expense" | "info" | "warn" | "invest";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted", income: "text-income", expense: "text-expense", info: "text-info", warn: "text-warn", invest: "text-invest",
};
const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted", income: "bg-income/10 text-income", expense: "bg-expense/10 text-expense",
  info: "bg-info/10 text-info", warn: "bg-warn/10 text-warn", invest: "bg-invest/10 text-invest",
};
const TONE_BAR: Record<Tone, string> = {
  neutral: "bg-muted", income: "bg-income", expense: "bg-expense", info: "bg-info", warn: "bg-warn", invest: "bg-invest",
};
export const toneText = (t: Tone) => TONE_TEXT[t];
export const toneSoft = (t: Tone) => TONE_SOFT[t];

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TONE_SOFT[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, tone = "info", className, label }: { value: number; tone?: Tone; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className={cn("h-full rounded-full transition-all", TONE_BAR[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" role="status" aria-label="Carregando" />;
}
