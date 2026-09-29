import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppData, CollectionKey } from "@/types";
import { emptyData } from "./defaults";
import type { Op, Repository } from "./repository";

interface TableSpec {
  table: string;
  /** Campos monetários (centavos no app ↔ numeric(14,2) no banco). */
  money: string[];
  /** Renomeia campos cujo nome seria palavra reservada/ambígua em SQL. */
  rename?: Record<string, string>;
}

export const TABLES: Record<CollectionKey, TableSpec> = {
  accounts: { table: "accounts", money: ["initialBalance"] },
  categories: { table: "categories", money: [] },
  transactions: { table: "transactions", money: ["amount"] },
  installments: { table: "installments", money: ["total"] },
  creditCards: { table: "credit_cards", money: ["limit"], rename: { limit: "credit_limit" } },
  subscriptions: { table: "subscriptions", money: ["amount", "previousAmount"], rename: { usage: "usage_level" } },
  recurring: { table: "recurring_transactions", money: ["amount"] },
  budgets: { table: "budgets", money: ["amount"] },
  goals: { table: "financial_goals", money: ["target", "current", "monthly"], rename: { target: "target_amount", current: "current_amount", monthly: "monthly_amount" } },
  emergencyEntries: { table: "emergency_fund_entries", money: ["amount"] },
  investments: { table: "investments", money: ["appliedAmount", "currentValue"] },
  investmentTransactions: { table: "investment_transactions", money: ["amount"] },
  assets: { table: "assets", money: ["value"] },
  liabilities: { table: "liabilities", money: ["balance", "monthlyPayment"] },
  snapshots: { table: "patrimony_snapshots", money: ["assets", "liabilities"] },
  clients: { table: "clients", money: ["monthlyValue", "monthlyCost"] },
  professionalIncome: { table: "professional_income", money: ["amount"] },
  notifications: { table: "notifications", money: [] },
};

/** Ordem de inserção respeitando chaves estrangeiras. */
const INSERT_ORDER: CollectionKey[] = [
  "accounts", "categories", "creditCards", "installments", "subscriptions", "recurring", "investments", "clients",
  "professionalIncome", "transactions", "investmentTransactions", "budgets", "goals", "emergencyEntries",
  "assets", "liabilities", "snapshots", "notifications",
];

const SINGLETONS: Record<"settings" | "emergencyFund", TableSpec> = {
  settings: { table: "user_settings", money: ["monthlyInvestmentPlan"] },
  emergencyFund: { table: "emergency_fund", money: ["essentialMonthly", "monthlyContribution"] },
};

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toDb(row: Record<string, unknown>, spec: { money: string[]; rename?: Record<string, string> }) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "virtual") continue;
    const col = spec.rename?.[k] ?? snake(k);
    if (spec.money.includes(k)) out[col] = v == null ? null : ((v as number) / 100).toFixed(2);
    else out[col] = v === undefined ? null : v;
  }
  return out;
}

function fromDb(row: Record<string, unknown>, spec: { money: string[]; rename?: Record<string, string> }) {
  const reverse = Object.fromEntries(Object.entries(spec.rename ?? {}).map(([k, v]) => [v, k]));
  const out: Record<string, unknown> = {};
  for (const [col, v] of Object.entries(row)) {
    if (col === "user_id" || col === "created_at_db") continue;
    const k = reverse[col] ?? camel(col);
    out[k] = spec.money.includes(k) && v != null ? Math.round(parseFloat(String(v)) * 100) : v;
  }
  return out;
}

/**
 * Persistência em Supabase. Toda leitura/escrita passa pelo usuário autenticado e é
 * filtrada por Row Level Security (ver supabase/migrations). user_id vem de auth.uid().
 */
export class SupabaseRepository implements Repository {
  readonly mode = "supabase" as const;
  constructor(private sb: SupabaseClient, private userId: string) {}

  private async fetchAll(table: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await this.sb.from(table).select("*").range(from, from + page - 1);
      if (error) throw error;
      rows.push(...(data as Record<string, unknown>[]));
      if (!data || data.length < page) break;
    }
    return rows;
  }

  async load(): Promise<AppData | null> {
    const base = emptyData();
    const out = { ...base } as Record<string, unknown>;
    const keys = Object.keys(TABLES) as CollectionKey[];
    const results = await Promise.all(keys.map((k) => this.fetchAll(TABLES[k].table)));
    keys.forEach((k, i) => { out[k] = results[i].map((r) => fromDb(r, TABLES[k])); });
    const [settings, fund] = await Promise.all([this.fetchAll(SINGLETONS.settings.table), this.fetchAll(SINGLETONS.emergencyFund.table)]);
    if (settings[0]) out.settings = { ...base.settings, ...fromDb(settings[0], SINGLETONS.settings) };
    if (fund[0]) out.emergencyFund = { ...base.emergencyFund, ...fromDb(fund[0], SINGLETONS.emergencyFund) };
    const data = out as unknown as AppData;
    // Primeiro acesso: semeia as categorias padrão na conta do usuário.
    if (data.categories.length === 0) {
      data.categories = base.categories;
      await this.persist({ type: "upsert", key: "categories", rows: data.categories }, data);
      return data;
    }
    return data;
  }

  async persist(op: Op, snapshot: AppData): Promise<void> {
    switch (op.type) {
      case "upsert": {
        const spec = TABLES[op.key];
        const rows = (op.rows as Record<string, unknown>[]).map((r) => ({ ...toDb(r, spec), user_id: this.userId }));
        for (let i = 0; i < rows.length; i += 500) {
          const conflict = op.key === "notifications" ? "user_id,id" : "id";
          const { error } = await this.sb.from(spec.table).upsert(rows.slice(i, i + 500), { onConflict: conflict });
          if (error) throw error;
        }
        return;
      }
      case "delete": {
        const spec = TABLES[op.key];
        for (let i = 0; i < op.ids.length; i += 200) {
          const { error } = await this.sb.from(spec.table).delete().in("id", op.ids.slice(i, i + 200));
          if (error) throw error;
        }
        return;
      }
      case "singleton": {
        const spec = SINGLETONS[op.key];
        const { error } = await this.sb
          .from(spec.table)
          .upsert({ ...toDb(op.value as Record<string, unknown>, spec), user_id: this.userId }, { onConflict: "user_id" });
        if (error) throw error;
        return;
      }
      case "replace": {
        // Limpa e regrava tudo (usado em "carregar demo" e "apagar dados").
        for (const k of Object.keys(TABLES) as CollectionKey[]) {
          const { error } = await this.sb.from(TABLES[k].table).delete().eq("user_id", this.userId);
          if (error) throw error;
        }
        for (const k of INSERT_ORDER) {
          const rows = snapshot[k] as unknown[];
          if (rows.length) await this.persist({ type: "upsert", key: k, rows }, snapshot);
        }
        await this.persist({ type: "singleton", key: "settings", value: snapshot.settings }, snapshot);
        await this.persist({ type: "singleton", key: "emergencyFund", value: snapshot.emergencyFund }, snapshot);
      }
    }
  }
}
