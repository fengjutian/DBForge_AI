/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/renderer/**/*.{ts,tsx,html}',
    './src/renderer/index.html'
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
          'Segoe UI', 'Helvetica Neue', 'Microsoft YaHei', 'PingFang SC',
          'Noto Sans CJK SC', 'Noto Sans SC', 'WenQuanYi Micro Hei',
          'Arial', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji'
        ],
        mono: [
          'ui-monospace', 'Cascadia Code', 'Source Code Pro', 'Menlo', 'Consolas',
          'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC',
          'monospace'
        ]
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 8px 32px -8px rgba(16,185,129,0.4)' },
          '50%': { boxShadow: '0 8px 48px -4px rgba(16,185,129,0.7)' }
        },
        'glow-pulse-dark': {
          '0%, 100%': { boxShadow: '0 8px 32px -8px rgba(16,185,129,0.5)' },
          '50%': { boxShadow: '0 8px 56px -4px rgba(16,185,129,0.8)' }
        },
        'ring-pulse': {
          '0%, 100%': { 
            boxShadow: '0 0 0 0px rgba(16,185,129,0.5), 0 8px 32px -8px rgba(16,185,129,0.4)'
          },
          '50%': { 
            boxShadow: '0 0 0 8px rgba(16,185,129,0), 0 8px 48px -4px rgba(16,185,129,0.6)'
          }
        },
        'ring-pulse-dark': {
          '0%, 100%': { 
            boxShadow: '0 0 0 0px rgba(16,185,129,0.6), 0 8px 32px -8px rgba(16,185,129,0.5)'
          },
          '50%': { 
            boxShadow: '0 0 0 8px rgba(16,185,129,0), 0 8px 56px -4px rgba(16,185,129,0.7)'
          }
        },
        'subtle-bounce': {
          '0%, 100%': { transform: 'translateY(0px) scale(1)' },
          '30%': { transform: 'translateY(-3px) scale(1.03)' },
          '60%': { transform: 'translateY(1px) scale(0.98)' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'float': 'float 4s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'glow-pulse-dark': 'glow-pulse-dark 3s ease-in-out infinite',
        'ring-pulse': 'ring-pulse 3s ease-in-out infinite',
        'ring-pulse-dark': 'ring-pulse-dark 3s ease-in-out infinite',
        'subtle-bounce': 'subtle-bounce 5s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
