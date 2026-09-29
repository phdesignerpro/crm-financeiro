import type { AppData } from "@/types";
import type { Op, Repository } from "./repository";

const KEY = "crm-financeiro:v1";

/** Modo demonstração: dados ficam apenas neste navegador (localStorage). */
export class LocalRepository implements Repository {
  readonly mode = "local" as const;
  private timer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<AppData | null> {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AppData) : null;
    } catch {
      return null;
    }
  }

  async persist(_op: Op, snapshot: AppData): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(snapshot));
      } catch {
        /* armazenamento indisponível */
      }
    }, 150);
  }
}
