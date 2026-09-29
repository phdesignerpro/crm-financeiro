"use client";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface TabItem<T extends string> { id: T; label: ReactNode }

export function Tabs<T extends string>({ items, value, onChange, className }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1", className)}>
      {items.map((t) => (
        <button
          key={t.id} role="tab" aria-selected={value === t.id} type="button" onClick={() => onChange(t.id)}
          className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition", value === t.id ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
