'use client';
import { useState, useEffect } from 'react';
import { type IntakeField, assembleIntakeMessage } from '@/lib/intake-fields';

const C = {
  mid: '#145C44', bg: '#F5F0E8', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232',
};

interface Props {
  fields: IntakeField[];
  sessionId: string;
  onSubmit: (assembled: string) => void;
  onSkip: () => void;
}

export function StructuredIntake({ fields, sessionId, onSubmit, onSkip }: Props) {
  const storageKey = `cas_intake_${sessionId}`;
  const required = fields.filter(f => f.required);
  const optional = fields.filter(f => !f.required);

  const [values, setValues] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch { return {}; }
  });
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(values)); } catch { /* ignore */ }
  }, [storageKey, values]);

  function setValue(key: string, val: string) {
    setValues(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    for (const f of required) {
      if (!values[f.key]?.trim()) newErrors[f.key] = 'Required';
    }
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    onSubmit(assembleIntakeMessage(fields, values));
  }

  function handleSkip() {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    onSkip();
  }

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    borderRadius: 8, padding: '7px 10px',
    fontSize: 12, outline: 'none',
    color: C.dark, background: '#fff',
    fontFamily: 'inherit',
  };

  function renderField(f: IntakeField) {
    const err = errors[f.key];
    const border = `1px solid ${err ? C.danger : C.border}`;
    return (
      <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: C.mid2, letterSpacing: '0.02em' }}>
          {f.label}
          {f.required && <span style={{ color: C.danger }}> *</span>}
        </label>
        {f.kind === 'textarea' ? (
          <textarea
            value={values[f.key] ?? ''}
            onChange={e => setValue(f.key, e.target.value)}
            placeholder={f.placeholder}
            rows={3}
            style={{ ...inputBase, border, resize: 'vertical', lineHeight: 1.5 }}
          />
        ) : (
          <input
            type="text"
            value={values[f.key] ?? ''}
            onChange={e => setValue(f.key, e.target.value)}
            placeholder={f.placeholder}
            style={{ ...inputBase, border }}
          />
        )}
        {err && <p style={{ fontSize: 10, color: C.danger, margin: 0 }}>{err}</p>}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: C.bg }}>
      {required.map(renderField)}

      {optional.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOptionalOpen(o => !o)}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: C.mid, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg
              viewBox="0 0 12 12" width={9} height={9}
              fill="none" stroke="currentColor" strokeWidth={2}
              style={{ transform: optionalOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
            >
              <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {optionalOpen ? 'Hide extra details' : 'Add more detail'}
          </button>
          {optionalOpen && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {optional.map(renderField)}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
        <button
          onClick={handleSubmit}
          style={{
            padding: '9px 0', borderRadius: 8, border: 'none',
            background: C.mid, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}
        >
          Get AI Draft
        </button>
        <button
          type="button"
          onClick={handleSkip}
          style={{
            background: 'none', border: 'none', padding: '2px 0',
            color: C.muted, fontSize: 11, cursor: 'pointer',
            textDecoration: 'underline', textAlign: 'center' as const,
          }}
        >
          Skip to free-form chat
        </button>
      </div>
    </div>
  );
}
