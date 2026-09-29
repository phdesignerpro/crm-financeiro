"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Mode = "system" | "light" | "dark";
interface ThemeCtx { mode: Mode; resolved: "light" | "dark"; setMode: (m: Mode) => void }
const Ctx = createContext<ThemeCtx>({ mode: "system", resolved: "light", setMode: () => {} });
const KEY = "crm-theme";

const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Script inline (executado antes da hidratação) evita "flash" de tema errado. */
export const THEME_SCRIPT = `(function(){try{var m=localStorage.getItem('${KEY}')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const apply = useCallback((m: Mode) => {
    const r = m === "system" ? (systemDark() ? "dark" : "light") : m;
    document.documentElement.setAttribute("data-theme", r);
    setResolved(r);
  }, []);

  useEffect(() => {
    let m: Mode = "system";
    try { m = (localStorage.getItem(KEY) as Mode) || "system"; } catch { /* ignore */ }
    setModeState(m);
    apply(m);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply((localStorage.getItem(KEY) as Mode) || "system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [apply]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
    apply(m);
  }, [apply]);

  return <Ctx.Provider value={{ mode, resolved, setMode }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
