/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc8fc',
          400: '#36adf8',
          500: '#0c93e9',
          600: '#0074c7',
          700: '#015da1',
          800: '#064f85',
          900: '#0b426e',
          950: '#072a49',
        },
        // Tokens semânticos do storefront
        background: 'var(--storefront-background)',
        foreground: 'var(--storefront-foreground)',
        card: 'var(--storefront-card)',
        'card-foreground': 'var(--storefront-card-foreground)',
        muted: 'var(--storefront-muted)',
        'muted-foreground': 'var(--storefront-muted-foreground)',
        border: 'var(--storefront-border)',
        input: 'var(--storefront-input)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};