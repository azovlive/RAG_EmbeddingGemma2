/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgba(15, 23, 42, 0.85)", // Mica/Acrylic slate-900 tint
        surface: "rgba(30, 41, 59, 0.70)",
        surfaceHover: "rgba(51, 65, 85, 0.80)",
        accent: "#38bdf8", // Sky 400
        accentHover: "#0ea5e9", // Sky 500
      },
      fontFamily: {
        sans: ["Segoe UI", "Pretendard", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        mono: ["Consolas", "Fira Code", "Cascadia Code", "monospace"],
      },
      backdropBlur: {
        xs: '2px',
        md: '16px',
        lg: '24px',
      }
    },
  },
  plugins: [],
}
