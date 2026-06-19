/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f0f0f',
        card: '#1a1a1a',
        surface: {
          DEFAULT: '#222222',
          hover: '#2a2a2a',
        },
        foreground: '#f5f5f5',
        muted: '#b8b8b8',
        subtle: '#8a8a8a',
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        border: '#333333',
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        chart: {
          1: '#3b82f6',
          2: '#22c55e',
          3: '#ef4444',
          4: '#f59e0b',
          5: '#8b5cf6',
          6: '#ec4899',
        },
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        sm: ['0.875rem', { lineHeight: '1.5' }],
        base: ['1rem', { lineHeight: '1.5' }],
        lg: ['1.25rem', { lineHeight: '1.4' }],
        xl: ['1.5rem', { lineHeight: '1.35' }],
        '2xl': ['2rem', { lineHeight: '1.25' }],
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
      },
      boxShadow: {
        card: '0 8px 24px rgba(0, 0, 0, 0.35)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      maxWidth: {
        page: '1100px',
      },
    },
  },
  plugins: [],
};