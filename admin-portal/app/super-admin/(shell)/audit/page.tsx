'use client';

import { useEffect, useState, useCallback } from 'react';
import { saApi } from '@/lib/super-admin-api';

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 25;

function actionLabel(action: string) {
  const map: Record<string, string> = {
    school_created:  'School Created',
    school_deleted:  'School Deleted',
    school_activated:'Activated Paid',
    school_updated:  'School Updated',
    trial_extended:  'Trial Extended',
    admin_pin_reset: 'PIN Reset',
    change_password: 'Password Changed',
  };
  return map[action] ?? action.replace(/_/g, ' ');
}

function actionStyle(action: string) {
  if (action === 'school_created')   return { bg: '#1e3a5f', color: '#60a5fa' };
  if (action === 'school_deleted')   return { bg: '#3b1f1f', color: '#f87171' };
  if (action === 'school_activated') return { bg: '#1e3a2a', color: '#4ade80' };
  if (action === 'trial_extended')   return { bg: '#3b2e0f', color: '#fbbf24' };
  if (action === 'admin_pin_reset')  return { bg: '#2e1b4e', color: '#c4b5fd' };
  if (action === 'change_password')  return { bg: '#1a2744', color: '#93c5fd' };
  return { bg: '#1e293b', color: '#94a3b8' };
}

function detailSummary(action: string, details: Record<string, unknown> | null): string {
  if (!details) return '';
  if (action === 'trial_extended' && details.days_added) return `+${details.days_added} days`;
  if (action === 'school_created' && details.code) return `Code: ${details.code}`;
  if (details.message && typeof details.message === 'string') return details.message;
  return '';
}

export default function AuditLogPage() {
  const [logs,    setLogs]    = useState<AuditEntry[]>([]);
  const [total,   setTotal]   = useState(0);
  const [offset,  setOffset]  = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async (off: number) => {
    setLoading(true); setError('');
    try {
      const res = await saApi.get(`/api/super-admin/audit-log?limit=${PAGE_SIZE}&offset=${off}`);
      setLogs(res.data.logs ?? []);
      setTotal(res.data.total ?? 0);
      setOffset(off);
    } catch {
      setError('Failed to load audit log.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(0); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-slate-400 mt-0.5">{total} total entries</p>
        </div>
        <button onClick={() => load(0)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 mb-4">{error}</p>}

      <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-800 border-b border-slate-700/50 animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-slate-500">No audit entries yet</div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {logs.map(log => {
              const style = actionStyle(log.action);
              const detail = detailSummary(log.action, log.details);
              return (
                <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 mt-0.5 whitespace-nowrap"
                    style={{ background: style.bg, color: style.color }}>
                    {actionLabel(log.action)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate">
                        {log.entity_name ?? 'Super Admin'}
                      </p>
                      {detail && (
                        <span className="text-xs text-slate-400">{detail}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(log.created_at).toLocaleString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-400">
            Page {currentPage} of {totalPages} · {total} entries
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || loading}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 font-semibold disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => load(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total || loading}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 font-semibold disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
