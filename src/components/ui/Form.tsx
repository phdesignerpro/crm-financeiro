"use client";
import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import { centsToInput, parseMoney } from "@/utils/money";
import type { Cents } from "@/types";

export function Field({ label, error, hint, children, className }: { label?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {error ? <p className="mt-1 text-xs text-expense" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cn("input", className)} />;
});

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function SelectInput({ className, children, ...p }, ref) {
  return <select ref={ref} {...p} className={cn("input pr-8", className)}>{children}</select>;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...p }, ref) {
  return <textarea ref={ref} rows={3} {...p} className={cn("input resize-none", className)} />;
});

/** Campo monetário em R$: mantém o texto digitado e devolve centavos inteiros. */
export function MoneyInput({ value, onChange, placeholder = "0,00", ...rest }: {
  value: Cents | null; onChange: (v: Cents | null) => void; placeholder?: string; id?: string; "aria-label"?: string; disabled?: boolean;
}) {
  const [text, setText] = useState(centsToInput(value));
  useEffect(() => {
    // sincroniza quando o valor externo muda (ex.: ao editar/duplicar)
    setText((cur) => (parseMoney(cur) === value || (value == null && cur === "") ? cur : centsToInput(value)));
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
      <input
        {...rest} inputMode="decimal" className="input num pl-9" placeholder={placeholder} value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, "");
          setText(t);
          const c = parseMoney(t);
          onChange(t === "" || Number.isNaN(c) ? null : c);
        }}
        onBlur={() => value != null && setText(centsToInput(value))}
      />
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-line accent-[rgb(var(--brand))]" />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ options, value, onChange, className }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg bg-surface-2 p-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition", value === o.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TagsInput({ value, onChange, placeholder = "Adicionar tag e Enter" }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim().replace(/^#/, "");
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="input flex min-h-[38px] flex-wrap items-center gap-1.5 !py-1.5">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs">
          #{t}
          <button type="button" aria-label={`Remover ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted hover:text-fg"><X size={12} /></button>
        </span>
      ))}
      <input
        value={draft} placeholder={value.length ? "" : placeholder} className="min-w-[100px] flex-1 bg-transparent text-sm outline-none"
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1)); }}
      />
    </div>
  );
}
