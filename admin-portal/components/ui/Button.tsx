import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size    = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:   'bg-green-700 hover:bg-green-600 text-white',
  secondary: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600',
  danger:    'bg-red-600 hover:bg-red-500 text-white',
  ghost:     'bg-transparent text-green-700 dark:text-green-400 hover:bg-slate-100 dark:hover:bg-slate-700',
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
      style={style}
      className={`inline-flex items-center justify-center font-semibold rounded-lg transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}
