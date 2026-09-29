import {
  Banknote, Briefcase, Building2, Coins, CreditCard, Landmark, PiggyBank, TrendingUp, Wallet, type LucideIcon,
} from "lucide-react";

export const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  wallet: Wallet, landmark: Landmark, banknote: Banknote, briefcase: Briefcase, "trending-up": TrendingUp,
  "piggy-bank": PiggyBank, coins: Coins, "credit-card": CreditCard, building: Building2,
};

export const iconFor = (name: string): LucideIcon => ACCOUNT_ICONS[name] ?? Wallet;
