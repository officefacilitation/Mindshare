/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#fafaf9",
        surface: "#ffffff",
        primary: {
          DEFAULT: "#0066cc",
          hover: "#0055b3",
          active: "#004ba3",
          light: "#e7f3ff",
        },
        ink: {
          DEFAULT: "#1d1d1f",
          muted: "#7a7a7a",
          subtle: "#a8a29d",
        },
        hairline: "#e5e5e7",
        tag: {
          bg: "#f0f0f0",
          accentBg: "#fff5e6",
          text: "#0066cc",
          gold: "#f0ad4e",
        },
        mention: {
          bg: "#e0f2f1",
          text: "#17a2b8",
        },
        status: {
          success: "#28a745",
          error: "#dc3545",
          warning: "#f0ad4e",
        }
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        none: 'none',
        subtle: '0 1px 3px rgba(0,0,0,0.05)',
        toast: '0 4px 14px rgba(0,0,0,0.12)',
        dropdown: '0 6px 20px rgba(0,0,0,0.08)',
      }
    },
  },
  plugins: [],
};
