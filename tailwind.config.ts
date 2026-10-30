const config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/componentes/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fondo: "var(--fondo)",
        frente: "var(--frente)",
        cobalto: "#2f63ff",
        tinta: "#111111",
        borde: "#e2e8f0",
      },
      fontFamily: {
        anton: ["var(--fuente-anton)", "sans-serif"],
        archivo: ["var(--fuente-archivo)", "sans-serif"],
        mono: ["var(--fuente-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

