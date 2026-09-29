"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { AppData, Collections, CollectionKey, EmergencyFund, Settings } from "@/types";
import { emptyData } from "@/database/defaults";
import { LocalRepository } from "@/database/local-repository";
import type { Op, Repository } from "@/database/repository";
import { buildDemoData } from "@/database/seed";
import { SupabaseRepository } from "@/database/supabase-repository";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { computeMaterialization } from "@/services/schedule";
import { todayISO } from "@/utils/date";

export interface StoreState {
  data: AppData;
  status: "loading" | "ready" | "error" | "unauthenticated";
  mode: "local" | "supabase";
  error: string | null;
  today: string;
  userEmail: string | null;
}

type Row = { id: string };

class Store {
  private state: StoreState = {
    data: emptyData(), status: "loading", mode: isSupabaseConfigured ? "supabase" : "local", error: null,
    today: todayISO(), userEmail: null,
  };
  private listeners = new Set<() => void>();
  private repo: Repository | null = null;
  private queue: Promise<void> = Promise.resolve();
  private started = false;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getState = () => this.state;
  private set(patch: Partial<StoreState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  async init() {
    if (this.started) return;
    this.started = true;
    try {
      if (isSupabaseConfigured) {
        const sb = getSupabase();
        const { data: u } = await sb.auth.getUser();
        if (!u.user) {
          this.set({ status: "unauthenticated" });
          return;
        }
        this.repo = new SupabaseRepository(sb, u.user.id);
        this.set({ userEmail: u.user.email ?? null });
      } else {
        this.repo = new LocalRepository();
      }
      const today = todayISO();
      let data = await this.repo.load();
      if (!data && this.repo.mode === "local") data = buildDemoData(today);
      data ??= emptyData();
      data = { ...emptyData(), ...data, settings: { ...emptyData().settings, ...data.settings } };
      this.set({ data, today, status: "ready" });
      await this.materialize();
      if (this.repo.mode === "local") void this.repo.persist({ type: "replace" }, this.state.data);
    } catch (e) {
      this.set({ status: "error", error: e instanceof Error ? e.message : "Falha ao carregar dados" });
    }
  }

  /** Gera lançamentos das recorrências vencidas e baixa compras de cartão já ocorridas. */
  private async materialize() {
    const { data, today } = this.state;
    const m = computeMaterialization(data, today);
    if (m.newTransactions.length) this.add("transactions", m.newTransactions);
    for (const u of m.recurringUpdates) this.patch("recurring", u.id, { generatedThrough: u.generatedThrough });
    for (const u of m.subscriptionUpdates) this.patch("subscriptions", u.id, { generatedThrough: u.generatedThrough });
    if (m.newCharges.length) this.add("professionalIncome", m.newCharges);
    for (const id of m.settleCardTxIds) this.patch("transactions", id, { status: "paid" });
  }

  private persist(op: Op) {
    const repo = this.repo;
    if (!repo) return;
    const snapshot = this.state.data;
    this.queue = this.queue
      .then(() => repo.persist(op, snapshot))
      .catch((e) => this.set({ error: e instanceof Error ? e.message : "Erro ao salvar" }));
  }

  private setData(data: AppData) {
    this.set({ data });
  }

  add = <K extends CollectionKey>(key: K, rows: Collections[K][number] | Collections[K][number][]) => {
    const list = (Array.isArray(rows) ? rows : [rows]) as Row[];
    if (!list.length) return;
    const cur = this.state.data[key] as unknown as Row[];
    const ids = new Set(list.map((r) => r.id));
    const next = [...cur.filter((r) => !ids.has(r.id)), ...list];
    this.setData({ ...this.state.data, [key]: next });
    this.persist({ type: "upsert", key, rows: list });
  };

  patch = <K extends CollectionKey>(key: K, id: string, patch: Partial<Collections[K][number]>) => {
    const cur = this.state.data[key] as unknown as Row[];
    let updated: Row | null = null;
    const next = cur.map((r) => (r.id === id ? (updated = { ...r, ...patch }) : r));
    if (!updated) return;
    this.setData({ ...this.state.data, [key]: next });
    this.persist({ type: "upsert", key, rows: [updated] });
  };

  remove = <K extends CollectionKey>(key: K, ids: string | string[]) => {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    const cur = this.state.data[key] as unknown as Row[];
    const removed = cur.filter((r) => set.has(r.id)).map((r) => r.id);
    if (!removed.length) return;
    this.setData({ ...this.state.data, [key]: cur.filter((r) => !set.has(r.id)) });
    this.persist({ type: "delete", key, ids: removed });
  };

  setSettings = (patch: Partial<Settings>) => {
    const settings = { ...this.state.data.settings, ...patch };
    this.setData({ ...this.state.data, settings });
    this.persist({ type: "singleton", key: "settings", value: settings });
  };

  setEmergencyFund = (patch: Partial<EmergencyFund>) => {
    const emergencyFund = { ...this.state.data.emergencyFund, ...patch };
    this.setData({ ...this.state.data, emergencyFund });
    this.persist({ type: "singleton", key: "emergencyFund", value: emergencyFund });
  };

  replaceAll = (data: AppData) => {
    this.setData(data);
    this.persist({ type: "replace" });
  };

  loadDemo = () => {
    const keepSettings = this.state.data.settings;
    const demo = buildDemoData(this.state.today);
    this.replaceAll({ ...demo, settings: { ...demo.settings, theme: keepSettings.theme } });
  };

  clearAll = () => {
    const keep = this.state.data.settings;
    const fresh = emptyData();
    this.replaceAll({ ...fresh, settings: { ...fresh.settings, theme: keep.theme, userName: keep.userName } });
  };

  dismissError = () => this.set({ error: null });

  async signOut() {
    if (isSupabaseConfigured) await getSupabase().auth.signOut();
  }
}

const store = new Store();
const StoreContext = createContext(store);

export function StoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void store.init();
  }, []);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppState(): StoreState {
  const s = useContext(StoreContext);
  return useSyncExternalStore(s.subscribe, s.getState, s.getState);
}

export const useData = () => useAppState().data;
export const useToday = () => useAppState().today;

export function useActions() {
  const s = useContext(StoreContext);
  return useMemo(
    () => ({
      add: s.add, patch: s.patch, remove: s.remove, setSettings: s.setSettings, setEmergencyFund: s.setEmergencyFund,
      loadDemo: s.loadDemo, clearAll: s.clearAll, dismissError: s.dismissError, signOut: () => s.signOut(),
    }),
    [s],
  );
}

export type Actions = ReturnType<typeof useActions>;
