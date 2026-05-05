import type { Config } from "tailwindcss";

// Observium-inspired palette: dark navy chrome, blue accents, dense type.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obs: {
          navy: "#1f2d3d",
          navyDark: "#172230",
          navyLight: "#2a3a4d",
          blue: "#3aa0e6",
          blueDark: "#1f7fc9",
          accent: "#5cb85c",
          warn: "#f0ad4e",
          danger: "#d9534f",
          surface: "#f5f7fa",
          border: "#d9dee4",
          text: "#1f2d3d",
          mute: "#7a8694",
        },
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', "Tahoma", "Arial", "sans-serif"],
        mono: ['"JetBrains Mono"', "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        xs: "11px",
        sm: "12px",
        base: "13px",
        lg: "15px",
      },
    },
  },
  plugins: [],
} satisfies Config;
