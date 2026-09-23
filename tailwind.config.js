/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        charcoal: {
          DEFAULT: '#233D4C',
          dark: '#182933',
          card: '#1D3340',
          hover: '#2D4D60',
          border: '#35566B',
        },
        pumpkin: {
          DEFAULT: '#FD802E',
          hover: '#E56D1F',
          active: '#CB5C14',
          light: '#FFA05C',
          muted: 'rgba(253, 128, 46, 0.15)',
        },
      },
    },
  },
  plugins: [],
};
