/** @type {import('tailwindcss').Config} */
// Chart palette mirrors tokens.css --chart-1…6 (Tailwind cannot read CSS vars at build time).
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        bg: '#f4f2ec',
        card: '#fffefa',
        surface: {
          DEFAULT: '#ece9e1',
          hover: '#e4e0d6',
        },
        foreground: '#1c1b18',
        muted: '#6b6860',
        subtle: '#8a867c',
        accent: {
          DEFAULT: '#3f6f5c',
          hover: '#335a4b',
        },
        border: '#ddd8cc',
        success: '#5a6b4a',
        danger: '#8f4e44',
        warning: '#8a7340',
        chart: {
          1: '#3f6f5c',
          2: '#5a6b4a',
          3: '#8f4e44',
          4: '#8a7340',
          5: '#6b6860',
          6: '#c4bfb2',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        sm: ['0.8125rem', { lineHeight: '1.5' }],
        base: ['0.9375rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.4' }],
        xl: ['1.375rem', { lineHeight: '1.35' }],
        '2xl': ['1.75rem', { lineHeight: '1.25' }],
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
      },
      borderRadius: {
        md: '8px',
        lg: '12px',
        xl: '12px',
      },
      boxShadow: {
        card: 'none',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      maxWidth: {
        page: '1180px',
      },
    },
  },
  plugins: [],
};
