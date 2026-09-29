"use client";
import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTheme } from "@/components/layout/ThemeProvider";
import { formatBRL, formatCompact } from "@/utils/money";

export function useChartColors() {
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  return {
    grid: dark ? "#2a2f3a" : "#e7eaf0", axis: dark ? "#8c95a6" : "#6b7385",
    income: dark ? "#34d399" : "#16a34a", expense: dark ? "#f87171" : "#dc2626", info: dark ? "#60a5fa" : "#2563eb",
    warn: dark ? "#fbbf24" : "#d97706", invest: dark ? "#a78bfa" : "#7c3aed", muted: dark ? "#4b5263" : "#cbd2de",
    surface: dark ? "#13161e" : "#ffffff",
  };
}

/** Evita renderizar gráficos no servidor (ResponsiveContainer precisa do DOM). */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

type TipPayload = { name?: string; value?: number; color?: string; dataKey?: string }[];
function Tip({ active, payload, label }: { active?: boolean; payload?: TipPayload; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span><span className="num ml-auto pl-3 font-medium text-fg">{formatBRL(p.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

const axisFmt = (v: number) => formatCompact(v);

function Frame({ height, children }: { height: number; children: React.ReactElement }) {
  const mounted = useMounted();
  if (!mounted) return <div style={{ height }} />;
  return <div style={{ height }} className="w-full"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

export function IncomeExpenseChart({ data, height = 260 }: { data: { label: string; income: number; expense: number }[]; height?: number }) {
  const c = useChartColors();
  return (
    <Frame height={height}>
      <BarChart data={data} barGap={3} margin={{ left: -8, right: 4, top: 4 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" stroke={c.axis} tickLine={false} axisLine={false} fontSize={11} />
        <YAxis stroke={c.axis} tickLine={false} axisLine={false} fontSize={11} tickFormatter={axisFmt} width={48} />
        <Tooltip content={<Tip />} cursor={{ fill: c.grid, opacity: 0.4 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="income" name="Entradas" fill={c.income} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar isAnimationActive={false} dataKey="expense" name="Despesas" fill={c.expense} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </Frame>
  );
}

export function AreaTrend({
  data, color = "info", height = 240, name = "Valor", zeroLine,
}: { data: { label: string; value: number }[]; color?: "info" | "income" | "invest" | "warn" | "expense"; height?: number; name?: string; zeroLine?: boolean }) {
  const c = useChartColors();
  const col = c[color];
  const id = `g-${color}`;
  return (
    <Frame height={height}>
      <AreaChart data={data} margin={{ left: -8, right: 4, top: 4 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity={0.18} /><stop offset="100%" stopColor={col} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" stroke={c.axis} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
        <YAxis stroke={c.axis} tickLine={false} axisLine={false} fontSize={11} tickFormatter={axisFmt} width={48} domain={["auto", "auto"]} />
        <Tooltip content={<Tip />} />
        {zeroLine && <ReferenceLine y={0} stroke={c.expense} strokeDasharray="4 4" />}
        <Area isAnimationActive={false} type="monotone" dataKey="value" name={name} stroke={col} strokeWidth={2} fill={`url(#${id})`} dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </Frame>
  );
}

export function Donut({
  data, height = 220, center,
}: { data: { name: string; value: number; color: string }[]; height?: number; center?: React.ReactNode }) {
  const c = useChartColors();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <Frame height={height}>
        <PieChart>
          <Tooltip content={<Tip />} />
          <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={data.length > 1 ? 2 : 0} stroke={c.surface} strokeWidth={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
        </PieChart>
      </Frame>
      {center && total > 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">{center}</div>}
    </div>
  );
}

export function SimpleBars({ data, color = "info", height = 220, name = "Valor" }: { data: { label: string; value: number }[]; color?: "info" | "income" | "expense" | "invest" | "warn"; height?: number; name?: string }) {
  const c = useChartColors();
  return (
    <Frame height={height}>
      <BarChart data={data} margin={{ left: -8, right: 4, top: 4 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" stroke={c.axis} tickLine={false} axisLine={false} fontSize={11} />
        <YAxis stroke={c.axis} tickLine={false} axisLine={false} fontSize={11} tickFormatter={axisFmt} width={48} />
        <Tooltip content={<Tip />} cursor={{ fill: c.grid, opacity: 0.4 }} />
        <Bar isAnimationActive={false} dataKey="value" name={name} fill={c[color]} radius={[6, 6, 0, 0]} maxBarSize={44} />
      </BarChart>
    </Frame>
  );
}

export function StackedBars({
  data, keys, height = 240,
}: { data: Record<string, number | string>[]; keys: { key: string; label: string; color: string }[]; height?: number }) {
  const c = useChartColors();
  return (
    <Frame height={height}>
      <BarChart data={data} margin={{ left: -8, right: 4, top: 4 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" stroke={c.axis} tickLine={false} axisLine={false} fontSize={11} />
        <YAxis stroke={c.axis} tickLine={false} axisLine={false} fontSize={11} tickFormatter={axisFmt} width={48} />
        <Tooltip content={<Tip />} cursor={{ fill: c.grid, opacity: 0.4 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k, i) => <Bar isAnimationActive={false} key={k.key} dataKey={k.key} name={k.label} stackId="a" fill={k.color} radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />)}
      </BarChart>
    </Frame>
  );
}

export function Legend2({ items }: { items: { name: string; value: string; color: string; pct?: string }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color }} />
          <span className="min-w-0 flex-1 truncate">{i.name}</span>
          <span className="num text-muted">{i.value}</span>
          {i.pct && <span className="num w-10 text-right font-medium">{i.pct}</span>}
        </li>
      ))}
    </ul>
  );
}
