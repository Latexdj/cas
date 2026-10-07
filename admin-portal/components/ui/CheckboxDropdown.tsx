'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface CheckboxDropdownOption {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  label: string;
  options: CheckboxDropdownOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Shows a search box once the option count passes this. Default 8. */
  searchThreshold?: number;
}

// A closed-by-default multi-select: a trigger button ("Subject · 3" or
// "Subject: All" when nothing is picked) that opens a checkbox panel below
// it. Built for filters with dozens of options (subjects, years) where a
// row of toggle chips would overflow into a wall of buttons — the panel
// scrolls internally instead of pushing page content around, and a search
// box appears once there are enough options to need one.
export function CheckboxDropdown({ label, options, selected, onChange, searchThreshold = 8 }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const groups = useMemo(() => {
    const map = new Map<string, CheckboxDropdownOption[]>();
    for (const opt of filtered) {
      const key = opt.group ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(opt);
    }
    return [...map.entries()];
  }, [filtered]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  }

  const triggerText = selected.length === 0 ? `${label}: All` : `${label} · ${selected.length}`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
          selected.length > 0 ? 'bg-[#145C44] text-white border-[#145C44]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        {triggerText}
        <svg className="inline-block ml-1.5 w-3 h-3 -mt-0.5" viewBox="0 0 20 20" fill="none" stroke="currentColor">
          <path d="M5 7.5l5 5 5-5" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-64 bg-white rounded-lg border border-slate-200 shadow-lg p-2">
          {options.length > searchThreshold && (
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-[#145C44]"
            />
          )}

          <div className="flex items-center justify-between px-1 mb-1">
            <button onClick={() => onChange(options.map(o => o.value))} className="text-[11px] font-semibold text-[#145C44] hover:underline">
              Select all
            </button>
            <button onClick={() => onChange([])} className="text-[11px] font-semibold text-slate-400 hover:underline">
              Clear
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="text-xs text-slate-400 px-1 py-2">No matches.</p>
            ) : groups.map(([group, opts]) => (
              <div key={group || '_'}>
                {group && <p className="text-[10px] font-semibold text-slate-400 px-1 pt-1.5 pb-0.5">{group}</p>}
                {opts.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt.value)}
                      onChange={() => toggle(opt.value)}
                      className="accent-[#145C44]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
