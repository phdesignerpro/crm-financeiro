import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { StoreProvider } from "@/hooks/useStore";
import { THEME_SCRIPT, ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Meu Caixa — gestão financeira", template: "%s · Meu Caixa" },
  description: "CRM financeiro pessoal e profissional: contas, cartões, investimentos, patrimônio e projeções.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        <ThemeProvider><StoreProvider>{children}</StoreProvider></ThemeProvider>
      </body>
    </html>
  );
}
