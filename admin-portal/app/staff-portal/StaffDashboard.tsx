'use client';
import { useEffect, useState, type ReactNode } from 'react';
import type { AxiosInstance } from 'axios';

export type DashTarget =
  | { section: 'clearance'; tab: 'pending' | 'lookup' | 'history' }
  | { section: 'library'; tab: 'dashboard' | 'issue' | 'return' | 'overdue' }
  | { section: 'inventory'; tab: 'items' | 'bulk-issue' | 'records' | 'loans' }
  | { section: 'accounts'; tab: 'dashboard' | 'collect' | 'arrears' | 'expenditure' }
  | { section: 'clinic'; tab: 'dashboard' | 'new-visit' | 'open' }
  | { section: 'letters' }
  | { section: 'budgets' };

export interface DashRoles {
  hasCl: boolean; hasLib: boolean; hasInv: boolean; isStores: boolean;
  hasAcc: boolean; isAccountant: boolean; hasClinic: boolean; hasLetters: boolean;
}

type Go = (t: DashTarget) => void;
type Tone = 'danger' | 'warning' | undefined;

const TONE_COLOR: Record<'danger' | 'warning', string> = { danger: '#B83232', warning: '#C8780A' };

function money(n: number | string | null | undefined) {
  return `GH₵ ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function isToday(d: string | null | undefined) {
  if (!d) return false;
  const x = new Date(d), t = new Date();
  return x.getFullYear() === t.getFullYear() && x.getMonth() === t.getMonth() && x.getDate() === t.getDate();
}
function shortDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function time(d: string) {
  return new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Tile({ label, value, tone, onClick }: {
  label: string; value: ReactNode; tone?: Tone; onClick?: () => void;
}) {
  const highlight = tone && typeof value === 'number' && value > 0;
  const body = (
    <>
      <p className={`${typeof value === 'string' ? 'text-lg sm:text-2xl' : 'text-2xl'} font-bold tabular-nums leading-tight whitespace-nowrap text-slate-900 dark:text-white`}
        style={highlight ? { color: TONE_COLOR[tone] } : undefined}>
        {value}
      </p>
      <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">{label}</p>
    </>
  );
  const cls = 'text-left bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700';
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} hover:border-slate-300 dark:hover:border-slate-500 transition-colors`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

function Block({ title, action, loading, error, children }: {
  title: string; action?: { label: string; onClick: () => void; primary: string };
  loading: boolean; error: boolean; children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-800 dark:text-white">{title}</h2>
        {action && (
          <button type="button" onClick={action.onClick}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ background: action.primary }}>
            {action.label}
          </button>
        )}
      </div>
      {loading ? (
        <div className="py-6 flex">
          <div className="w-5 h-5 rounded-full border-2 border-b-transparent animate-spin" style={{ borderColor: '#145C44', borderBottomColor: 'transparent' }} />
        </div>
      ) : error ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Could not load these figures. Check your connection and reload the page.</p>
      ) : children}
    </section>
  );
}

function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{children}</div>;
}

function Attention({ title, rows, empty, more }: {
  title: string; empty: string; more?: { label: string; onClick: () => void };
  rows: { key: string; main: string; sub: string; right?: string; urgent?: boolean }[];
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        {more && rows.length > 0 && (
          <button type="button" onClick={more.onClick} className="text-xs font-semibold text-[#145C44] dark:text-[#2ab289] hover:underline">
            {more.label}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {rows.map(r => (
            <div key={r.key} className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 dark:text-white truncate">{r.main}</p>
                <p className="text-xs text-slate-400 truncate">{r.sub}</p>
              </div>
              {r.right && (
                <span className="text-xs font-semibold shrink-0" style={{ color: r.urgent ? '#B83232' : undefined }}>
                  {r.right}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The database pooler only accepts a handful of connections, so the dashboard
// loads its blocks a few at a time instead of firing every request at once.
const MAX_CONCURRENT_BLOCKS = 2;
let activeBlocks = 0;
const waiting: (() => void)[] = [];
async function throttled<T>(task: () => Promise<T>): Promise<T> {
  if (activeBlocks >= MAX_CONCURRENT_BLOCKS) await new Promise<void>(r => waiting.push(r));
  activeBlocks++;
  try { return await task(); }
  finally { activeBlocks--; waiting.shift()?.(); }
}
async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  try { return await task(); }
  catch { await new Promise(r => setTimeout(r, 800)); return task(); }
}

// Each block loads its own figures so one module failing never blanks the page.
function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    throttled(() => withRetry(fn))
      .then(d => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading: !data && !error };
}

// ── Role blocks ──────────────────────────────────────────────────────────────

interface Pending { item_id: string; name: string; student_code: string; class_name: string; office_name: string; }
interface Hist { item_id: string; status: string; actioned_at: string | null; }

function ClearanceBlock({ api, go, primary }: { api: AxiosInstance; go: Go; primary: string }) {
  const { data, error, loading } = useLoad(async () => {
    const [p, h] = await Promise.all([
      api.get<Pending[]>('/api/clearance/pending'),
      api.get<Hist[]>('/api/clearance/history'),
    ]);
    return { pending: p.data, history: h.data };
  });
  const today = (data?.history ?? []).filter(x => isToday(x.actioned_at));
  // /history returns the latest 50 decisions only.
  const capped = (n: number) => (data?.history.length === 50 && today.length === 50 ? `${n}+` : n);
  return (
    <Block title="Clearance" loading={loading} error={error}
      action={{ label: 'Look up a student', onClick: () => go({ section: 'clearance', tab: 'lookup' }), primary }}>
      {data && (
        <div className="space-y-3">
          <Tiles>
            <Tile label="Waiting for your decision" value={data.pending.length} tone="warning"
              onClick={() => go({ section: 'clearance', tab: 'pending' })} />
            <Tile label="Cleared today" value={capped(today.filter(x => x.status === 'cleared').length)}
              onClick={() => go({ section: 'clearance', tab: 'history' })} />
            <Tile label="Not cleared today" value={capped(today.filter(x => x.status === 'not_cleared').length)}
              onClick={() => go({ section: 'clearance', tab: 'history' })} />
          </Tiles>
          <Attention title="Waiting for clearance"
            empty="No students are waiting on your office right now."
            more={{ label: `View all ${data.pending.length}`, onClick: () => go({ section: 'clearance', tab: 'pending' }) }}
            rows={data.pending.slice(0, 5).map(p => ({
              key: p.item_id, main: p.name, sub: `${p.student_code}, ${p.class_name}`, right: p.office_name,
            }))} />
        </div>
      )}
    </Block>
  );
}

interface LibStats { total_books: number; available_copies: number; active_loans: number; overdue_loans: number; returned_today: number; }
interface LibOverdue { id: string; days_overdue: number; book_title: string; student_name: string; class_name: string; }

function LibraryBlock({ api, go, primary }: { api: AxiosInstance; go: Go; primary: string }) {
  const { data, error, loading } = useLoad(async () => {
    const [s, o] = await Promise.all([
      api.get<LibStats>('/api/library/dashboard'),
      api.get<LibOverdue[]>('/api/library/loans/overdue'),
    ]);
    return { stats: s.data, overdue: o.data };
  });
  return (
    <Block title="Library" loading={loading} error={error}
      action={{ label: 'Issue a book', onClick: () => go({ section: 'library', tab: 'issue' }), primary }}>
      {data && (
        <div className="space-y-3">
          <Tiles>
            <Tile label="Books on loan" value={data.stats.active_loans} onClick={() => go({ section: 'library', tab: 'return' })} />
            <Tile label="Overdue" value={data.stats.overdue_loans} tone="danger" onClick={() => go({ section: 'library', tab: 'overdue' })} />
            <Tile label="Returned today" value={data.stats.returned_today} />
            <Tile label="Copies available" value={data.stats.available_copies} />
          </Tiles>
          <Attention title="Longest overdue"
            empty="No overdue books. Everything on loan is within its due date."
            more={{ label: 'View all overdue', onClick: () => go({ section: 'library', tab: 'overdue' }) }}
            rows={[...data.overdue].sort((a, b) => b.days_overdue - a.days_overdue).slice(0, 5).map(l => ({
              key: l.id, main: l.book_title, sub: `${l.student_name}, ${l.class_name}`,
              right: `${l.days_overdue} day${l.days_overdue === 1 ? '' : 's'} late`, urgent: true,
            }))} />
        </div>
      )}
    </Block>
  );
}

interface InvStats { total_items: number; total_units: number; available_units: number; items_with_issued: number; damaged_items: number; }
interface InvItem { id: string; condition: string; quantity_available: number; }
interface InvLoan { id: string; borrower_name: string; borrower_detail: string | null; item_name: string; due_date: string | null; }
interface InvBatch { id: string; title: string; issued_at: string; signed_list_url: string | null; recipient_count: number; }

function InventoryBlock({ api, go, primary, isStores }: { api: AxiosInstance; go: Go; primary: string; isStores: boolean }) {
  const { data, error, loading } = useLoad(async () => {
    const [s, items, loans, batches] = await Promise.all([
      api.get<InvStats>('/api/inventory/stats'),
      api.get<InvItem[]>('/api/inventory/items'),
      api.get<InvLoan[]>('/api/inventory/loans/active', { params: { overdue_only: 'true' } }),
      api.get<InvBatch[]>('/api/inventory/batches'),
    ]);
    return { stats: s.data, items: items.data, overdue: loans.data, batches: batches.data };
  });
  const outOfStock = (data?.items ?? []).filter(i => i.condition !== 'Written Off' && i.quantity_available === 0).length;
  const missingSheets = (data?.batches ?? []).filter(b => !b.signed_list_url);
  return (
    <Block title={isStores ? 'Stores' : 'Inventory'} loading={loading} error={error}
      action={{ label: 'Bulk issue', onClick: () => go({ section: 'inventory', tab: 'bulk-issue' }), primary }}>
      {data && (
        <div className="space-y-3">
          <Tiles>
            <Tile label="Items in stock" value={data.stats.total_items} onClick={() => go({ section: 'inventory', tab: 'items' })} />
            <Tile label="Out of stock" value={outOfStock} tone="warning" onClick={() => go({ section: 'inventory', tab: 'items' })} />
            <Tile label="Overdue loans" value={data.overdue.length} tone="danger" onClick={() => go({ section: 'inventory', tab: 'loans' })} />
            <Tile label="Records missing a signed sheet" value={missingSheets.length} tone="warning"
              onClick={() => go({ section: 'inventory', tab: 'records' })} />
            <Tile label="Damaged items" value={data.stats.damaged_items} tone="warning" onClick={() => go({ section: 'inventory', tab: 'items' })} />
            <Tile label="Units available" value={`${data.stats.available_units.toLocaleString()} / ${data.stats.total_units.toLocaleString()}`} />
          </Tiles>
          <div className="grid lg:grid-cols-2 gap-3">
            <Attention title="Overdue returnable items"
              empty="No overdue loans. Every returnable item out is within its due date."
              more={{ label: 'View loans', onClick: () => go({ section: 'inventory', tab: 'loans' }) }}
              rows={data.overdue.slice(0, 5).map(l => ({
                key: l.id, main: l.item_name, sub: [l.borrower_name, l.borrower_detail].filter(Boolean).join(', '),
                right: l.due_date ? `Due ${shortDate(l.due_date)}` : undefined, urgent: true,
              }))} />
            <Attention title="Signed sheets still to upload"
              empty="Every issue record has its signed sheet attached."
              more={{ label: 'View records', onClick: () => go({ section: 'inventory', tab: 'records' }) }}
              rows={missingSheets.slice(0, 5).map(b => ({
                key: b.id, main: b.title, sub: `${b.recipient_count} recipient${b.recipient_count === 1 ? '' : 's'}`,
                right: shortDate(b.issued_at),
              }))} />
          </div>
        </div>
      )}
    </Block>
  );
}

interface Payment { id: string; amount: string; payment_date: string; payment_method: string; student_name: string; student_code: string; }
interface FeeStats { total_billed: number; total_collected: number; outstanding: number; total_expenses: number; net_position: number; }

function AccountsBlock({ api, go, primary, isAccountant }: { api: AxiosInstance; go: Go; primary: string; isAccountant: boolean }) {
  const { data, error, loading } = useLoad(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [todayRes, totalRes, recentRes, statsRes] = await Promise.all([
      api.get<Payment[]>('/api/fees/payments', { params: { from: today, to: today } }),
      api.get<{ grand_total: number }>('/api/fees/reports/collections'),
      api.get<Payment[]>('/api/fees/payments'),
      isAccountant ? api.get<FeeStats>('/api/fees/stats') : Promise.resolve(null),
    ]);
    return { today: todayRes.data, total: totalRes.data.grand_total, recent: recentRes.data.slice(0, 5), stats: statsRes?.data ?? null };
  }, [isAccountant]);
  const todaySum = (data?.today ?? []).reduce((s, p) => s + Number(p.amount), 0);
  return (
    <Block title={isAccountant ? 'Accounts' : 'Fee collection'} loading={loading} error={error}
      action={{ label: 'Collect payment', onClick: () => go({ section: 'accounts', tab: 'collect' }), primary }}>
      {data && (
        <div className="space-y-3">
          <Tiles>
            <Tile label={`Collected today (${data.today.length} receipt${data.today.length === 1 ? '' : 's'})`} value={money(todaySum)}
              onClick={() => go({ section: 'accounts', tab: 'dashboard' })} />
            <Tile label="Total collected" value={money(data.total)} />
            {data.stats && (
              <>
                <Tile label="Outstanding fees" value={money(data.stats.outstanding)}
                  onClick={() => go({ section: 'accounts', tab: 'arrears' })} />
                <Tile label="Expenses recorded" value={money(data.stats.total_expenses)}
                  onClick={() => go({ section: 'accounts', tab: 'expenditure' })} />
                <Tile label="Collected minus expenses" value={money(data.stats.net_position)} />
              </>
            )}
          </Tiles>
          <Attention title="Latest payments"
            empty="No payments recorded yet. Payments you collect will appear here."
            rows={data.recent.map(p => ({
              key: p.id, main: p.student_name, sub: `${p.student_code}, ${p.payment_method}, ${shortDate(p.payment_date)}`,
              right: money(p.amount),
            }))} />
        </div>
      )}
    </Block>
  );
}

interface Visit { id: string; patient_name: string; class_name: string | null; complaint: string; severity: string; arrived_at: string; }
interface ClinicDash { open_visits: Visit[]; today_visits: number; severity_breakdown: { severity: string; count: number }[]; }

function ClinicBlock({ api, go, primary }: { api: AxiosInstance; go: Go; primary: string }) {
  const { data, error, loading } = useLoad(async () => (await api.get<ClinicDash>('/api/clinic/dashboard')).data);
  const serious = data?.severity_breakdown.find(s => s.severity === 'serious')?.count ?? 0;
  return (
    <Block title="Clinic" loading={loading} error={error}
      action={{ label: 'Record a visit', onClick: () => go({ section: 'clinic', tab: 'new-visit' }), primary }}>
      {data && (
        <div className="space-y-3">
          <Tiles>
            <Tile label="In the clinic now" value={data.open_visits.length} tone="warning" onClick={() => go({ section: 'clinic', tab: 'open' })} />
            <Tile label="Visits today" value={data.today_visits} onClick={() => go({ section: 'clinic', tab: 'dashboard' })} />
            <Tile label="Serious cases today" value={serious} tone="danger" onClick={() => go({ section: 'clinic', tab: 'dashboard' })} />
          </Tiles>
          <Attention title="Still in the clinic"
            empty="No open visits. Everyone seen today has been discharged."
            more={{ label: 'View open visits', onClick: () => go({ section: 'clinic', tab: 'open' }) }}
            rows={data.open_visits.slice(0, 5).map(v => ({
              key: v.id, main: v.patient_name, sub: [v.class_name, v.complaint].filter(Boolean).join(', '),
              right: `Since ${time(v.arrived_at)}`, urgent: v.severity === 'serious',
            }))} />
        </div>
      )}
    </Block>
  );
}

interface Letter { id: string; subject: string; status: string; issued_date: string | null; created_at: string; ext_recipient_name: string | null; }

function LettersBlock({ api, go, primary }: { api: AxiosInstance; go: Go; primary: string }) {
  const { data, error, loading } = useLoad(async () => (await api.get<Letter[]>('/api/general-letters')).data);
  const now = new Date();
  const thisMonth = (data ?? []).filter(l => {
    const d = new Date(l.issued_date ?? l.created_at);
    return l.status === 'issued' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const drafts = (data ?? []).filter(l => l.status === 'draft').length;
  return (
    <Block title="Letters to parents" loading={loading} error={error}
      action={{ label: 'Write a letter', onClick: () => go({ section: 'letters' }), primary }}>
      {data && (
        <div className="space-y-3">
          <Tiles>
            <Tile label="Sent this month" value={thisMonth} onClick={() => go({ section: 'letters' })} />
            <Tile label="Drafts not yet sent" value={drafts} tone="warning" onClick={() => go({ section: 'letters' })} />
          </Tiles>
          <Attention title="Recent letters"
            empty="You haven't written any letters yet. Use Write a letter to send one to a parent."
            more={{ label: 'View all', onClick: () => go({ section: 'letters' }) }}
            rows={data.slice(0, 4).map(l => ({
              key: l.id, main: l.subject, sub: l.ext_recipient_name ?? '',
              right: l.status === 'draft' ? 'Draft' : shortDate(l.issued_date ?? l.created_at),
            }))} />
        </div>
      )}
    </Block>
  );
}

interface BudgetTask { key: string; label: string; count: number }

// Shown only when something in the budget chain is waiting on this person
// (staff have no notification inbox, so this is where they find out).
function BudgetTasksBlock({ api, go, primary }: { api: AxiosInstance; go: Go; primary: string }) {
  const [tasks, setTasks] = useState<BudgetTask[] | null>(null);
  useEffect(() => {
    let alive = true;
    throttled(() => withRetry(() => api.get<BudgetTask[]>('/api/department-budgets/my-tasks')))
      .then(r => { if (alive) setTasks(r.data); })
      .catch(() => { if (alive) setTasks([]); });
    return () => { alive = false; };
  }, [api]);
  if (!tasks || tasks.length === 0) return null;
  return (
    <Block title="Budgets" loading={false} error={false}
      action={{ label: 'Open budgets', onClick: () => go({ section: 'budgets' }), primary }}>
      <Attention title="Waiting on you" empty=""
        rows={tasks.map(t => ({ key: t.key, main: t.label, sub: '', right: String(t.count), urgent: true }))} />
    </Block>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function StaffDashboard({ api, primary, roles, onNavigate }: {
  api: AxiosInstance; primary: string; roles: DashRoles; onNavigate: Go;
}) {
  const p = { api, go: onNavigate, primary };
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="space-y-7 max-w-5xl">
      <p className="text-sm text-slate-500 dark:text-slate-400 -mt-2">{dateLabel}</p>
      {roles.hasClinic  && <ClinicBlock {...p} />}
      {roles.hasCl      && <ClearanceBlock {...p} />}
      {roles.hasLib     && <LibraryBlock {...p} />}
      {roles.hasInv     && <InventoryBlock {...p} isStores={roles.isStores} />}
      {roles.hasAcc     && <AccountsBlock {...p} isAccountant={roles.isAccountant} />}
      {roles.hasLetters && <LettersBlock {...p} />}
      <BudgetTasksBlock {...p} />
    </div>
  );
}
