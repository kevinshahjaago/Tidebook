import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["DM Sans", "system-ui", "sans-serif"],
      },
      colors: {
        // Seattle Aquarium Mediterranean Blue — exact primary from official logo
        aqua: {
          50: "#EEF4FB",
          100: "#C9DDF5",
          200: "#92BBE9",
          300: "#5B9ADE",
          400: "#337DCF",
          500: "#1A63B0",   // Mediterranean Blue — official brand primary
          600: "#154E8C",
          700: "#103A69",   // primary dark — buttons, active states
          800: "#0B2847",
          900: "#071929",   // sidebar dark
        },
        // Deep navy for text and dark UI elements
        navy: {
          700: "#0F1F35",
          800: "#0A1525",
          900: "#05101A",
        },
        // Warm amber accent
        coral: {
          400: "#F4A142",
          500: "#F08520",
          600: "#D96B10",
        },
        // Light blue-gray neutral
        seafoam: {
          50: "#F0F6FD",
          100: "#D6E8F8",
          200: "#A8CCEF",
        },
      },
      backgroundImage: {
        "ocean-gradient": "linear-gradient(135deg, #071929 0%, #103A69 50%, #1A63B0 100%)",
        "ocean-gradient-subtle": "linear-gradient(135deg, #0B2847 0%, #103A69 100%)",
      },
      boxShadow: {
        "card": "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px 0 rgb(0 0 0 / 0.12), 0 2px 4px -1px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
