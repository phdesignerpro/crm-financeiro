"use client";
import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActions, useData, useToday } from "@/hooks/useStore";
import { buildAlerts, type AlertLevel } from "@/services/notifications";
import { cn } from "@/utils/cn";

export const LEVEL_DOT: Record<AlertLevel, string> = { danger: "bg-expense", warning: "bg-warn", info: "bg-info" };

export function useAlerts() {
  const d = useData();
  const today = useToday();
  return useMemo(() => buildAlerts(d, today), [d, today]);
}

export function useMarkRead() {
  const a = useActions();
  return (ids: string[]) => ids.forEach((id) => a.add("notifications", { id, readAt: new Date().toISOString() }));
}

export function NotificationsPanel() {
  const alerts = useAlerts();
  const markRead = useMarkRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = alerts.filter((a) => !a.read);

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
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notificações${unread.length ? `, ${unread.length} não lidas` : ""}`} aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg">
        <Bell size={18} />
        {unread.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-expense px-1 text-[10px] font-semibold text-white">{unread.length}</span>}
      </button>
      {open && (
        <div className="animate-in fixed inset-x-3 top-16 z-50 max-h-[70dvh] overflow-hidden rounded-xl border border-line bg-surface shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notificações</p>
            {unread.length > 0 && <button type="button" onClick={() => markRead(unread.map((a) => a.id))} className="flex items-center gap-1 text-xs text-brand hover:underline"><Check size={12} />Marcar todas como lidas</button>}
          </div>
          <ul className="max-h-[52dvh] divide-y divide-line overflow-y-auto">
            {alerts.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nenhum alerta no momento.</li>}
            {alerts.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link href={a.href} onClick={() => { markRead([a.id]); setOpen(false); }} className={cn("flex gap-3 px-4 py-3 transition hover:bg-surface-2", a.read && "opacity-60")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", LEVEL_DOT[a.level])} />
                  <span className="min-w-0"><span className="block text-sm font-medium">{a.title}</span><span className="block text-xs text-muted">{a.body}</span></span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/notificacoes" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-brand hover:bg-surface-2">Ver central de notificações</Link>
        </div>
      )}
    </div>
  );
}
