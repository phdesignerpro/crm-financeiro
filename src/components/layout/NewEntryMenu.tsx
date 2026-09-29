"use client";
import { ArrowLeftRight, CreditCard, LineChart, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useEntryModal } from "@/components/forms/EntryModal";
import type { EntryKind } from "@/services/transactions";
import { cn } from "@/utils/cn";

const OPTIONS: { id: EntryKind; label: string; desc: string; icon: React.ReactNode; tone: string }[] = [
  { id: "income", label: "Entrada", desc: "Salário, cliente, rendimento", icon: <TrendingUp size={16} />, tone: "bg-income/10 text-income" },
  { id: "expense", label: "Despesa", desc: "Conta, pix, débito, boleto", icon: <TrendingDown size={16} />, tone: "bg-expense/10 text-expense" },
  { id: "card", label: "Compra no cartão", desc: "À vista ou parcelada", icon: <CreditCard size={16} />, tone: "bg-info/10 text-info" },
  { id: "investment", label: "Investimento", desc: "Aporte em um ativo", icon: <LineChart size={16} />, tone: "bg-invest/10 text-invest" },
  { id: "transfer", label: "Transferência", desc: "Entre suas contas", icon: <ArrowLeftRight size={16} />, tone: "bg-surface-2 text-muted" },
];

export function NewEntryMenu({ variant = "button" }: { variant?: "button" | "fab" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const openModal = useEntryModal();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {variant === "button" ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="btn btn-primary">
          <Plus size={16} /> <span className="hidden sm:inline">Nova movimentação</span><span className="sm:hidden">Novo</span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Nova movimentação" aria-expanded={open}
          className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-pop transition active:scale-95">
          <Plus size={26} />
        </button>
      )}
      {open && (
        <div role="menu" className={cn("animate-in absolute z-50 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-pop", variant === "fab" ? "bottom-16 left-1/2 -translate-x-1/2" : "right-0 top-11")}>
          {OPTIONS.map((o) => (
            <button key={o.id} role="menuitem" type="button" onClick={() => { setOpen(false); openModal({ entry: o.id }); }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface-2">
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", o.tone)}>{o.icon}</span>
              <span><span className="block text-sm font-medium">{o.label}</span><span className="block text-xs text-muted">{o.desc}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
