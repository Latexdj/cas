'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface AuditLog {
  id: string;
  action: string;
  actor_name: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; bg: string; color: string }> = {
  ATTENDANCE_REVOKED:     { label: 'Revoked',            bg: '#FEF2F2', color: '#DC2626' },
  ATTENDANCE_DELETED:     { label: 'Deleted',            bg: '#FFF7ED', color: '#EA580C' },
  ABSENCE_DELETED:        { label: 'Absence Cleared',    bg: '#EFF6FF', color: '#2563EB' },
  ABSENCE_STATUS_CHANGED: { label: 'Status Changed',     bg: '#F0FDF4', color: '#16A34A' },
  ABSENCE_CREATED_MANUAL: { label: 'Manual Absence',     bg: '#FDF4FF', color: '#9333EA' },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, bg: '#F1F5F9', color: '#64748B' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function DetailsCell({ details }: { details: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(details).filter(k => k !== 'teacher_id');
  if (!keys.length) return <span className="text-gray-400 text-xs">—</span>;

  const preview = keys
    .slice(0, 2)
    .map(k => `${k.replace(/_/g, ' ')}: ${details[k]}`)
    .join(' · ');

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="text-xs text-blue-600 hover:underline text-left">
        {open ? 'Hide' : preview}
      </button>
      {open && (
        <div className="mt-1 p-2 bg-slate-50 rounded text-xs space-y-0.5 max-w-xs">
          {keys.map(k => (
            <p key={k}><span className="font-medium text-slate-600 capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
              <span className="text-slate-800">{String(details[k])}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [action,  setAction]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [offset,  setOffset]  = useState(0);
  const LIMIT = 50;

  const ALL_ACTIONS = Object.keys(ACTION_META);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: String(LIMIT), offset: String(offset) };
      if (action) params.action = action;
      if (from)   params.from   = from;
      if (to)     params.to     = to;
      const { data } = await api.get<{ logs: AuditLog[]; total: number }>('/api/audit-log', { params });
      setLogs(data.logs);
      setTotal(data.total);
    } finally { setLoading(false); }
  }, [action, from, to, offset]);

  useEffect(() => { load(); }, [load]);

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Audit Log</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Complete record of all administrative actions in the system</p>
      </div>

      {/* Filters */}
      <form onSubmit={e => { e.preventDefault(); setOffset(0); load(); }} className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Action</label>
          <select value={action} onChange={e => setAction(e.target.value)}
            className="mt-1 w-52 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}>
            <option value="">All Actions</option>
            {ALL_ACTIONS.map(a => (
              <option key={a} value={a}>{ACTION_META[a].label}</option>
            ))}
          </select>
        </div>
        <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
        <Input label="To"   type="date" value={to}   onChange={e => setTo(e.target.value)}   className="w-40" />
        <Button type="submit">Filter</Button>
        <Button type="button" variant="secondary" onClick={() => { setAction(''); setFrom(''); setTo(''); setOffset(0); }}>Clear</Button>
      </form>

      <p className="text-sm" style={{ color: '#64748B' }}>{total} log entr{total !== 1 ? 'ies' : 'y'}</p>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  {['Timestamp', 'Action', 'Performed By', 'Details'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: i < logs.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: '#475569' }}>
                      {formatTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>
                      {log.actor_name ?? <span style={{ color: '#CBD5E1' }}>System</span>}
                    </td>
                    <td className="px-4 py-3">
                      <DetailsCell details={log.details ?? {}} />
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>No audit entries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: '#64748B' }}>Page {currentPage} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOffset(o => Math.max(0, o - LIMIT))} disabled={offset === 0}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOffset(o => o + LIMIT)} disabled={offset + LIMIT >= total}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
