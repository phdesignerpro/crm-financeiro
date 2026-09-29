import type { ISODate, MonthKey } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = (): ISODate => toISO(new Date());

export const monthOf = (d: ISODate): MonthKey => d.slice(0, 7);

export function monthStart(m: MonthKey): ISODate {
  return `${m}-01`;
}

export function daysInMonth(y: number, m1: number): number {
  return new Date(y, m1, 0).getDate();
}

export function monthEnd(m: MonthKey): ISODate {
  const [y, mm] = m.split("-").map(Number);
  return `${m}-${pad(daysInMonth(y, mm))}`;
}

export function addMonthsKey(m: MonthKey, n: number): MonthKey {
  const [y, mm] = m.split("-").map(Number);
  const idx = y * 12 + (mm - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** Soma meses preservando o dia (ajustando ao último dia do mês quando necessário). */
export function addMonths(d: ISODate, n: number, dayOverride?: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const key = addMonthsKey(`${y}-${pad(m)}`, n);
  const [ny, nm] = key.split("-").map(Number);
  const dd = Math.min(dayOverride ?? day, daysInMonth(ny, nm));
  return `${key}-${pad(dd)}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = fromISO(d);
  x.setDate(x.getDate() + n);
  return toISO(x);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86_400_000);
}

export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m <= to; m = addMonthsKey(m, 1)) out.push(m);
  return out;
}

export function lastMonths(current: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonthsKey(current, i - (count - 1)));
}

export function dayOf(d: ISODate): number {
  return Number(d.slice(8, 10));
}

/** 2026-09-29 -> 29/09/2026 */
export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function formatDateShort(d: ISODate): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export const monthName = (m: MonthKey) => MONTHS[Number(m.slice(5, 7)) - 1];
export const monthShort = (m: MonthKey) => MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3).toLowerCase();
export const monthLabel = (m: MonthKey) => `${monthName(m)} de ${m.slice(0, 4)}`;
export const monthShortYear = (m: MonthKey) => `${monthShort(m)}/${m.slice(2, 4)}`;

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function relativeDays(d: ISODate, today: ISODate): string {
  const n = diffDays(d, today);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  if (n > 0) return `em ${n} dias`;
  return `há ${-n} dias`;
}
