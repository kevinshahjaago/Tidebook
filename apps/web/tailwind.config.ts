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
        // Seattle Aquarium signature ocean teal palette
        aqua: {
          50: "#EBF8FA",
          100: "#C3EDF4",
          200: "#87D9E7",
          300: "#3BBDD4",
          400: "#009EB8",
          500: "#0083A0",
          600: "#006B82",
          700: "#005568",   // primary brand — used for buttons, sidebar
          800: "#003E4E",
          900: "#002A36",
        },
        // Deep navy for text and dark UI elements
        navy: {
          700: "#1A3347",
          800: "#0F2234",
          900: "#091929",
        },
        // Warm coral/amber accent
        coral: {
          400: "#F4A142",
          500: "#F08520",
          600: "#D96B10",
        },
        // Seafoam neutral
        seafoam: {
          50: "#F2FAF8",
          100: "#D9F0EC",
          200: "#A8DBD3",
        },
      },
      backgroundImage: {
        "ocean-gradient": "linear-gradient(135deg, #002A36 0%, #005568 50%, #0083A0 100%)",
        "ocean-gradient-subtle": "linear-gradient(135deg, #003E4E 0%, #005568 100%)",
      },
      boxShadow: {
        "card": "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px 0 rgb(0 0 0 / 0.12), 0 2px 4px -1px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
