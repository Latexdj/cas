'use client';
import { useEffect, useRef, useState } from 'react';

export interface PersonHit { code: string; name: string; detail?: string | null }

// A "name or ID" box for issuing screens. Typing filters people by name or
// code (like the bills collection search); choosing one fills in their code
// and runs the same lookup the Find button does. Typing a full code and
// pressing Enter still works exactly as before.
export default function NameOrIdSearch({
  value, onChange, onPick, onEnter, search, placeholder = 'Type a name or ID…', className = '', inputClassName = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (code: string) => void;
  onEnter?: () => void;
  search: (q: string) => Promise<PersonHit[]>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const picked = useRef<string | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || picked.current === value) { setHits([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchRef.current(q)
        .then(r => { if (!cancelled) { setHits(r); setActive(-1); setOpen(true); } })
        .catch(() => { if (!cancelled) setHits([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value]);

  function pick(h: PersonHit) {
    picked.current = h.code;
    setHits([]); setOpen(false);
    onChange(h.code);
    onPick(h.code);
  }

  return (
    <div className={`relative ${className}`}>
      <input
        value={value}
        onChange={e => { picked.current = null; onChange(e.target.value); }}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (open && hits.length && e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
          else if (open && hits.length && e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && active >= 0 && hits[active]) pick(hits[active]);
            else if (open && hits.length === 1) pick(hits[0]);
            else { setOpen(false); onEnter?.(); }
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {searching && <p className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">Searching…</p>}
      {open && hits.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-30 overflow-hidden max-h-72 overflow-y-auto">
          {hits.map((h, i) => (
            <div key={h.code}
              onMouseDown={e => { e.preventDefault(); pick(h); }}
              onMouseEnter={() => setActive(i)}
              className={`px-4 py-2.5 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0 ${i === active ? 'bg-slate-50 dark:bg-slate-700/50' : ''}`}>
              <span className="font-semibold text-slate-800 dark:text-white text-sm">{h.name}</span>
              <span className="text-slate-400 text-xs ml-2">{h.code}{h.detail ? `, ${h.detail}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {open && !searching && hits.length === 0 && value.trim().length >= 2 && picked.current !== value && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-30 px-4 py-2.5 text-xs text-slate-400">
          Nobody matches that name or ID. Check the spelling, or press Enter to look up the exact ID.
        </div>
      )}
    </div>
  );
}
