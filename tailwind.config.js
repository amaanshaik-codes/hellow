/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'SF Pro Display',
          'SF Pro Icons',
          'San Francisco',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        system: {
          background: 'hsl(var(--system-background) / <alpha-value>)',
          label: 'hsl(var(--label-color) / <alpha-value>)',
          secondaryLabel: 'hsl(var(--secondary-label-color) / <alpha-value>)',
          accent: 'hsl(var(--accent-color) / <alpha-value>)',
          destructive: 'hsl(var(--destructive-color) / <alpha-value>)',
        },
      },
      borderRadius: {
        'apple': '24px',
        'apple-lg': '32px',
      },
      boxShadow: {
        'apple': '0 8px 32px 0 rgba(31, 38, 135, 0.18)',
      },
      backdropBlur: {
        apple: '16px',
      },
      spacing: {
        18: '4.5rem',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
