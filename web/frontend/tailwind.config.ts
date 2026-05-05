import type { Config } from "tailwindcss";

// Observium-inspired palette: dark navy chrome, blue accents, dense type.
// Colors that change between light/dark use CSS custom properties so every
// component picks up the switch automatically without needing dark: variants.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obs: {
          // ── static (same in both themes) ──
          navy:      "#1f2d3d",
          navyDark:  "#172230",
          navyLight: "#2a3a4d",
          blue:      "#3aa0e6",
          blueDark:  "#1f7fc9",
          accent:    "#5cb85c",
          warn:      "#f0ad4e",
          danger:    "#d9534f",
          // ── theme-aware (backed by CSS vars; support opacity modifiers) ──
          // Values are space-separated RGB channels: "R G B"
          card:    "rgb(var(--obs-card)    / <alpha-value>)",
          surface: "rgb(var(--obs-surface) / <alpha-value>)",
          border:  "rgb(var(--obs-border)  / <alpha-value>)",
          text:    "rgb(var(--obs-text)    / <alpha-value>)",
          mute:    "rgb(var(--obs-mute)    / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', "Tahoma", "Arial", "sans-serif"],
        mono: ['"JetBrains Mono"', "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        xs:   "11px",
        sm:   "12px",
        base: "13px",
        lg:   "15px",
      },
    },
  },
  plugins: [],
} satisfies Config;
