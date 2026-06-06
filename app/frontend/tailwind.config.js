// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy:    '#1c2050',
          navyLight: '#2d3561',
          green:   '#4caf82',
          greenDark: '#2e7d32',
          greenBg:  '#e8f8ee',
          sidebar: '#1a1a2e',
          bg:      '#f5f6fa',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};