"use client";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EntryModalProvider } from "@/components/forms/EntryModal";
import { Button } from "@/components/ui/Button";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { Spinner } from "@/components/ui/Feedback";
import { useActions, useAppState } from "@/hooks/useStore";
import { cn } from "@/utils/cn";
import { MOBILE_TABS, NAV } from "./nav";
import { NewEntryMenu } from "./NewEntryMenu";
import { NotificationsPanel } from "./NotificationsPanel";
import { useTheme } from "./ThemeProvider";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Principal">
      {NAV.map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", active ? "bg-brand/10 text-brand" : "text-muted hover:bg-surface-2 hover:text-fg")}>
            <n.icon size={17} strokeWidth={active ? 2.2 : 1.8} />{n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">$</span>
      <span className="text-[15px] font-semibold tracking-tight">Meu Caixa</span>
    </Link>
  );
}

export function ThemeToggle() {
  const { resolved, setMode } = useTheme();
  return (
    <button type="button" aria-label="Alternar tema claro/escuro" onClick={() => setMode(resolved === "dark" ? "light" : "dark")}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg">
      {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const st = useAppState();
  const actions = useActions();
  const router = useRouter();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { if (st.status === "unauthenticated") router.replace("/login"); }, [st.status, router]);
  useEffect(() => setDrawer(false), [path]);

  if (st.status === "loading" || st.status === "unauthenticated")
    return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (st.status === "error")
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">Não foi possível carregar seus dados</h1>
        <p className="text-sm text-muted">{st.error}</p>
        <Button variant="primary" onClick={() => location.reload()}>Tentar novamente</Button>
      </div>
    );

  return (
    <ConfirmProvider>
      <EntryModalProvider>
        <div className="min-h-screen">
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface py-5 lg:flex">
            <Logo />
            <div className="mt-6 flex-1 overflow-y-auto px-3"><NavList /></div>
            <div className="mx-3 mt-3 rounded-lg bg-surface-2 p-3 text-xs text-muted">
              {st.mode === "local" ? <>Modo demonstração: os dados ficam somente neste navegador.</> : <>Conectado como <b className="text-fg">{st.userEmail}</b></>}
            </div>
          </aside>

          {drawer && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/45" onClick={() => setDrawer(false)} />
              <div className="animate-in absolute inset-y-0 left-0 flex w-72 flex-col bg-surface py-5 shadow-pop">
                <div className="flex items-center justify-between pr-3"><Logo />
                  <button aria-label="Fechar menu" onClick={() => setDrawer(false)} className="text-muted"><X size={20} /></button></div>
                <div className="mt-6 flex-1 overflow-y-auto px-3"><NavList onNavigate={() => setDrawer(false)} /></div>
              </div>
            </div>
          )}

          <div className="lg:pl-64">
            <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface/85 px-4 backdrop-blur lg:px-8">
              <div className="flex items-center gap-2">
                <button aria-label="Abrir menu" onClick={() => setDrawer(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"><Menu size={20} /></button>
                <span className="text-sm font-semibold lg:hidden">Meu Caixa</span>
                {st.mode === "local" && <span className="hidden rounded-full bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn sm:inline">Demonstração</span>}
              </div>
              <div className="flex items-center gap-1">
                <div className="hidden lg:block"><NewEntryMenu /></div>
                <NotificationsPanel />
                <ThemeToggle />
                {st.mode === "supabase" && (
                  <button aria-label="Sair" title="Sair" onClick={async () => { await actions.signOut(); router.replace("/login"); }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><LogOut size={18} /></button>
                )}
              </div>
            </header>

            {st.error && (
              <div role="alert" className="mx-4 mt-4 flex items-center justify-between rounded-lg border border-expense/30 bg-expense/10 px-4 py-2 text-sm text-expense lg:mx-8">
                <span>Erro ao salvar: {st.error}</span><button onClick={actions.dismissError} aria-label="Dispensar"><X size={16} /></button>
              </div>
            )}
            <main className="mx-auto max-w-[1400px] px-4 py-6 pb-28 lg:px-8 lg:pb-10">{children}</main>
          </div>

          <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-line bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            {[MOBILE_TABS[0], MOBILE_TABS[1]].map((n) => <TabLink key={n.href} n={n} path={path} />)}
            <div className="flex justify-center"><NewEntryMenu variant="fab" /></div>
            {[MOBILE_TABS[2], MOBILE_TABS[3]].map((n) => <TabLink key={n.href} n={n} path={path} />)}
          </nav>
        </div>
      </EntryModalProvider>
    </ConfirmProvider>
  );
}

function TabLink({ n, path }: { n: (typeof NAV)[number]; path: string }) {
  const active = isActive(path, n.href);
  const label = n.label.split(" ")[0];
  return (
    <Link href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-brand" : "text-muted")}>
      <n.icon size={20} />{label}
    </Link>
  );
}
