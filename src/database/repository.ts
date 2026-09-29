import type { AppData, CollectionKey } from "@/types";

export type Op =
  | { type: "upsert"; key: CollectionKey; rows: unknown[] }
  | { type: "delete"; key: CollectionKey; ids: string[] }
  | { type: "singleton"; key: "settings" | "emergencyFund"; value: unknown }
  | { type: "replace" };

export interface Repository {
  readonly mode: "local" | "supabase";
  /** Retorna null quando ainda não há dados persistidos. */
  load(): Promise<AppData | null>;
  /** Persiste a operação. `snapshot` é o estado completo após a operação. */
  persist(op: Op, snapshot: AppData): Promise<void>;
}
