'use client';
/**
 * One place to find anything: students, teachers and admin pages.
 * Opens from the header field or with Ctrl K / ⌘K. Students and teachers are
 * loaded once when search first opens and filtered in the browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { allPages } from './admin-nav';

type Person = { id: string; name: string; code: string; detail: string };
type Result = { kind: 'Student' | 'Teacher' | 'Page'; key: string; title: string; detail: string; href: string };

let peopleCache: { students: Person[]; teachers: Person[] } | null = null;
const RECENT_KEY = 'cas_search_recent';

function readRecent(): Result[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } }
function saveRecent(r: Result) { try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...readRecent().filter(x => x.key !== r.key)].slice(0, 6))); } catch { /* ignore */ } }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState(peopleCache);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    if (peopleCache) return;
    setLoading(true);
    Promise.all([
      api.get('/api/students', { params: { status: 'all' } }).then(r => r.data).catch(() => []),
      api.get('/api/teachers').then(r => r.data).catch(() => []),
    ]).then(([s, t]) => {
      peopleCache = {
        students: (Array.isArray(s) ? s : []).map((x: { id: string; name: string; student_code: string; class_name?: string; status?: string }) =>
          ({ id: x.id, name: x.name, code: x.student_code, detail: [x.class_name, x.status !== 'Active' ? x.status : null].filter(Boolean).join(', ') })),
        teachers: (Array.isArray(t) ? t : []).map((x: { id: string; name: string; teacher_code: string; department?: string }) =>
          ({ id: x.id, name: x.name, code: x.teacher_code, detail: x.department ?? '' })),
      };
      setPeople(peopleCache);
    }).finally(() => setLoading(false));
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const term = norm(q.trim());
    if (!term) return readRecentSafe();
    const hit = (...xs: string[]) => xs.some(x => norm(x ?? '').includes(term));
    const pages: Result[] = allPages()
      .filter(e => hit(e.item.label, e.module?.label ?? '', e.section))
      .slice(0, 6)
      .map(e => ({ kind: 'Page', key: 'p' + e.item.href, title: e.module ? `${e.module.label}: ${e.item.label}` : e.item.label, detail: e.section, href: e.item.href }));
    const students: Result[] = (people?.students ?? []).filter(p => hit(p.name, p.code)).slice(0, 8)
      .map(p => ({ kind: 'Student', key: 's' + p.id, title: p.name, detail: [p.code, p.detail].filter(Boolean).join(', '), href: `/students/${p.id}` }));
    const teachers: Result[] = (people?.teachers ?? []).filter(p => hit(p.name, p.code)).slice(0, 5)
      .map(p => ({ kind: 'Teacher', key: 't' + p.id, title: p.name, detail: [p.code, p.detail].filter(Boolean).join(', '), href: `/teachers/${p.id}` }));
    return [...students, ...teachers, ...pages];
  }, [q, people]);

  useEffect(() => { setSel(0); }, [q]);

  const go = useCallback((r: Result) => { saveRecent(r); setOpen(false); router.push(r.href); }, [router]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-9 min-w-9 px-2.5 md:w-56 rounded-lg border border-line bg-surface text-ink-muted text-sm hover:border-line-strong"
        aria-label="Search students, teachers and pages" aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" /></svg>
        <span className="hidden md:inline flex-1 text-left whitespace-nowrap truncate">Search</span>
        <kbd className="hidden md:inline text-xs font-mono px-1.5 py-0.5 rounded border border-line">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]" role="presentation">
          <div className="absolute inset-0 bg-[#0B3D2E]/55" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Search" className="relative w-full max-w-xl rounded-2xl bg-elevated border border-line shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 border-b border-line">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" /></svg>
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, ID or page"
                aria-label="Search" role="combobox" aria-expanded="true" aria-controls="global-search-results"
                onKeyDown={e => {
                  if (e.key === 'Escape') setOpen(false);
                  else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
                  else if (e.key === 'Enter' && results[sel]) go(results[sel]);
                }}
                className="flex-1 h-14 bg-transparent text-base text-ink outline-none !border-0 !bg-transparent" />
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-muted px-2 py-1 rounded hover:bg-sunken">Close</button>
            </div>
            <ul id="global-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
              {!q.trim() && results.length > 0 && <li className="px-4 py-1 text-xs text-ink-muted">Recent</li>}
              {results.map((r, i) => (
                <li key={r.key} role="option" aria-selected={i === sel}>
                  <button type="button" onClick={() => go(r)} onMouseEnter={() => setSel(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === sel ? 'bg-sunken' : ''}`}>
                    <span className="w-16 flex-shrink-0 text-xs text-ink-muted">{r.kind}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-ink truncate">{r.title}</span>
                      {r.detail && <span className="block text-xs text-ink-muted truncate">{r.detail}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {q.trim() && results.length === 0 && (
                <li className="px-4 py-6 text-sm text-ink-muted">
                  {loading ? 'Loading students and teachers…' : `Nothing matches “${q.trim()}”. Try a surname or an ID such as AHS26049.`}
                </li>
              )}
              {!q.trim() && results.length === 0 && (
                <li className="px-4 py-6 text-sm text-ink-muted">Type a student or teacher name, an ID, or a page such as “Exam scores”.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function readRecentSafe(): Result[] { return typeof window === 'undefined' ? [] : readRecent(); }
