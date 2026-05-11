import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size    = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:   'text-white hover:opacity-90',
  secondary: 'hover:opacity-80',
  danger:    'text-white hover:opacity-90',
  ghost:     'hover:opacity-80',
};

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary:   { backgroundColor: '#15803D', color: '#fff' },
  secondary: { backgroundColor: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' },
  danger:    { backgroundColor: '#DC2626', color: '#fff' },
  ghost:     { backgroundColor: 'transparent', color: '#15803D' },
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export function Button({ variant = 'primary', size = 'md', loading, disabled, children, className = '', style, ...rest }: Props) {
  return (
    <button
      disabled={disabled || loading}
      style={{ ...variantStyles[variant], ...style }}
      className={`inline-flex items-center justify-center font-semibold rounded-lg transition-opacity
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}
