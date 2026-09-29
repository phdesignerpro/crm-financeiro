"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { LEVEL_DOT, useAlerts, useMarkRead } from "@/components/layout/NotificationsPanel";
import { cn } from "@/utils/cn";

export default function NotificacoesPage() {
  const alerts = useAlerts();
  const markRead = useMarkRead();
  const unread = alerts.filter((a) => !a.read);
  return (
    <>
      <PageHeader title="Central de notificações" description="Alertas gerados automaticamente a partir de vencimentos, limites, orçamento e clientes."
        actions={unread.length > 0 ? <Button onClick={() => markRead(unread.map((a) => a.id))}>Marcar todas como lidas</Button> : undefined} />
      <Card pad={false}>
        {alerts.length === 0 ? <EmptyState title="Tudo em dia" description="Nenhum alerta no momento." /> : (
          <ul className="divide-y divide-line">{alerts.map((a) => (
            <li key={a.id}><Link href={a.href} onClick={() => markRead([a.id])} className={cn("flex gap-3 px-5 py-4 transition hover:bg-surface-2", a.read && "opacity-60")}>
              <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", LEVEL_DOT[a.level])} /><span><span className="block text-sm font-medium">{a.title}</span><span className="block text-sm text-muted">{a.body}</span></span></Link></li>))}</ul>)}
      </Card>
    </>
  );
}
