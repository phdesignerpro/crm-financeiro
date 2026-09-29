import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        brand: v("brand"),
        income: v("income"),
        expense: v("expense"),
        info: v("info"),
        warn: v("warn"),
        invest: v("invest"),
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.04)",
        pop: "0 12px 40px rgb(0 0 0 / 0.18)",
      },
      borderRadius: { xl2: "1.125rem" },
    },
  },
  plugins: [],
};
export default config;
