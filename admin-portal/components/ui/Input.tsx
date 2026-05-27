import { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...rest }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <input
        className={`w-full rounded-lg px-3 py-2.5 text-sm transition-shadow
          bg-white dark:bg-slate-700
          text-slate-900 dark:text-slate-100
          placeholder:text-slate-400 dark:placeholder:text-slate-500
          border dark:border-slate-600
          focus:outline-none focus:ring-2 focus:ring-green-600/30 focus:border-green-600
          ${error ? 'border-red-500' : 'border-slate-200'}
          ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
