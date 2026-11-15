'use client';
/**
 * In-page replacements for the browser's confirm(), alert() and prompt().
 *
 *   if (!(await confirmAction('Delete this item?'))) return;
 *   notify('Saved.');                       // a notice, not a blocking pop-up
 *   const reason = await promptText('Reason for voiding');   // null if cancelled
 *
 * <DialogHost /> is mounted once in the root layout (app/providers.tsx), so
 * these work from any page. They are drawn in CAS colours, take focus, close
 * on Escape, and work the same on phones.
 */
import { useEffect, useRef, useState } from 'react';

type Tone = 'success' | 'error' | 'info';
interface ConfirmReq { kind: 'confirm'; message: string; title?: string; confirmLabel: string; destructive: boolean; resolve: (v: boolean) => void }
interface PromptReq  { kind: 'prompt';  message: string; defaultValue: string; confirmLabel: string; resolve: (v: string | null) => void }
interface Notice     { id: number; message: string; tone: Tone }

type Listener = () => void;
let queue: (ConfirmReq | PromptReq)[] = [];
let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l());

const DESTRUCTIVE = /\b(delete|remove|void|revoke|reset|discard|cancel|reject|deactivate|disable|archive|clear|overwrite|replace|erase|unpublish|close)\b/i;
const ERROR = /\b(fail|failed|error|could ?not|cannot|can't|invalid|unable|denied|not allowed|required|must)\b/i;

/** In-page confirmation. Resolves true when confirmed. */
export function confirmAction(message: string, opts: { title?: string; confirmLabel?: string; destructive?: boolean } = {}): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const destructive = opts.destructive ?? DESTRUCTIVE.test(message);
  const verb = message.match(DESTRUCTIVE)?.[1];
  const confirmLabel = opts.confirmLabel ?? (verb ? verb[0].toUpperCase() + verb.slice(1).toLowerCase() : 'Continue');
  return new Promise(resolve => { queue = [...queue, { kind: 'confirm', message, title: opts.title, confirmLabel, destructive, resolve }]; emit(); });
}

/** In-page text entry. Resolves the text, or null when cancelled. */
export function promptText(message: string, defaultValue = '', opts: { confirmLabel?: string } = {}): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => { queue = [...queue, { kind: 'prompt', message, defaultValue: defaultValue ?? '', confirmLabel: opts.confirmLabel ?? 'Save', resolve }]; emit(); });
}

/** A short notice in the corner. Errors stay until closed; others close after 6 seconds. */
export function notify(message: unknown, tone?: Tone) {
  if (typeof window === 'undefined') return;
  const text = String(message ?? '');
  const t: Tone = tone ?? (ERROR.test(text) ? 'error' : 'info');
  const id = nextId++;
  notices = [...notices, { id, message: text, tone: t }];
  emit();
  if (t !== 'error') setTimeout(() => dismiss(id), 6000);
}
function dismiss(id: number) { notices = notices.filter(n => n.id !== id); emit(); }

export function DialogHost() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const current = queue[0];
  return (
    <>
      {current && <DialogView key={queue.length + current.message} req={current} />}
      {notices.length > 0 && (
        <div className="fixed z-[70] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2" aria-live="polite">
          {notices.map(n => (
            <div key={n.id} role={n.tone === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm ${n.tone === 'error'
                ? 'bg-[#FBEDED] border-[#B83232]/30 text-[#7A2222] dark:bg-[#371515] dark:text-[#F08B7E]'
                : n.tone === 'success'
                  ? 'bg-[#E8F4EE] border-[#145C44]/25 text-[#0B3D2E] dark:bg-[#153721] dark:text-[#6CC48F]'
                  : 'bg-elevated border-line text-ink'}`}>
              <p className="flex-1 leading-snug whitespace-pre-line">{n.message}</p>
              <button type="button" onClick={() => dismiss(n.id)} aria-label="Close notice"
                className="-m-1 p-1 rounded-md opacity-70 hover:opacity-100">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DialogView({ req }: { req: ConfirmReq | PromptReq }) {
  const [value, setValue] = useState(req.kind === 'prompt' ? req.defaultValue : '');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { (req.kind === 'prompt' ? inputRef.current : okRef.current)?.focus(); }, [req.kind]);

  const finish = (ok: boolean) => {
    queue = queue.slice(1);
    if (req.kind === 'confirm') req.resolve(ok);
    else req.resolve(ok ? value : null);
    emit();
  };
  const danger = req.kind === 'confirm' && req.destructive;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-[#0B3D2E]/55" onClick={() => finish(false)} />
      <div role="alertdialog" aria-modal="true" aria-label={req.kind === 'confirm' ? (req.title ?? 'Confirm') : req.message}
        onKeyDown={e => { if (e.key === 'Escape') finish(false); }}
        className="relative w-full max-w-md rounded-2xl bg-elevated border border-line shadow-xl p-5 space-y-4">
        {req.kind === 'confirm' && req.title && <h2 className="text-base font-semibold text-ink">{req.title}</h2>}
        <p className="text-sm text-ink whitespace-pre-line leading-relaxed">{req.message}</p>
        {req.kind === 'prompt' && (
          <textarea ref={inputRef} value={value} onChange={e => setValue(e.target.value)} rows={3}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); } }}
            className="w-full rounded-lg border border-line-strong bg-surface text-ink px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#145C44]" />
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => finish(false)}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-line-strong text-ink-2 hover:bg-sunken">
            Cancel
          </button>
          <button ref={okRef} type="button" onClick={() => finish(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${danger ? 'bg-[#B83232] hover:bg-[#9B2020]' : 'bg-[#145C44] hover:bg-[#0B3D2E]'}`}>
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
