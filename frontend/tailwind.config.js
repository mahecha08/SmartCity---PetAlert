/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#121212', // Fondo negro mate
          800: '#1e1e1e', // Tarjetas y paneles
          700: '#2c2c2c', // Bordes sutiles
        },
        accent: {
          primary: '#4f46e5', // Indigo (púrpura desaturado/tecnológico)
          hover: '#4338ca',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
