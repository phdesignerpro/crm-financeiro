import type { Cents } from "@/types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** 125000 -> "R$ 1.250,00" */
export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** Sem centavos, para rótulos de gráficos. */
export function formatBRLShort(cents: Cents): string {
  return brlCompact.format(Math.round(cents / 100)).replace(/ /g, " ");
}

export function formatCompact(cents: Cents): string {
  const v = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (v >= 1_000_000) return `${sign}${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (v >= 1_000) return `${sign}${(v / 1_000).toFixed(1).replace(".", ",").replace(",0", "")} mil`;
  return `${sign}${Math.round(v)}`;
}

/** "1.250,50" | "1250.5" | "R$ 1.250,50" -> 125050. Retorna NaN se inválido. */
export function parseMoney(input: string): Cents {
  const raw = input.replace(/[^\d,.-]/g, "").trim();
  if (!raw) return NaN;
  let s = raw;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  else if (/^-?\d{1,3}\.\d{3}$/.test(s)) s = s.replace(".", "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Centavos -> texto de input editável "1250,50". */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function signedPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits).replace(".", ",")}%`;
}

/** Divide um valor em N parcelas sem perder centavos (resto vai para a 1ª parcela). */
export function splitInstallments(total: Cents, count: number): Cents[] {
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? rest : 0));
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
