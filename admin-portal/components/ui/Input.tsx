import { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...rest }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
          {label}
        </label>
      )}
      <input
        className={`w-full rounded-lg px-3 py-2.5 text-sm transition-shadow ${className}`}
        style={{
          border: error ? '1px solid #EF4444' : '1px solid #E2E8F0',
          outline: 'none',
          color: '#0F172A',
          backgroundColor: '#FAFAFA',
          boxShadow: 'none',
        }}
        onFocus={e => { e.currentTarget.style.border = '1px solid #15803D'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21,128,61,0.1)'; }}
        onBlur={e  => { e.currentTarget.style.border = error ? '1px solid #EF4444' : '1px solid #E2E8F0'; e.currentTarget.style.boxShadow = 'none'; }}
        {...rest}
      />
      {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
    </div>
  );
}
