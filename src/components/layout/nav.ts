import {
  Briefcase, CalendarRange, CreditCard, FlaskConical, Landmark, LayoutDashboard, Lightbulb, LineChart, ArrowLeftRight,
  Repeat, ScrollText, Settings, ShieldCheck, Target, Wallet, type LucideIcon,
} from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon }

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/cartoes", label: "Cartões de Crédito", icon: CreditCard },
  { href: "/assinaturas", label: "Assinaturas", icon: Repeat },
  { href: "/planejamento", label: "Planejamento", icon: CalendarRange },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/reserva", label: "Reserva de Emergência", icon: ShieldCheck },
  { href: "/investimentos", label: "Investimentos", icon: LineChart },
  { href: "/patrimonio", label: "Patrimônio", icon: Landmark },
  { href: "/profissional", label: "Finanças Profissionais", icon: Briefcase },
  { href: "/relatorios", label: "Relatórios", icon: ScrollText },
  { href: "/insights", label: "Insights Financeiros", icon: Lightbulb },
  { href: "/simulador", label: "Simulador Financeiro", icon: FlaskConical },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export const MOBILE_TABS: NavItem[] = [NAV[0], NAV[1], NAV[3], NAV[5]];
