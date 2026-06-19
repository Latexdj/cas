'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';

interface Leave {
  id: string;
  reason: string; type: string; date_from: string; date_to: string;
  status: string; rejection_reason?: string; approved_at?: string; created_at: string;
  teacher_name: string; teacher_code: string; department: string;
}

const STATUS_STYLES: Record<string, { bg: string; bgD: string; text: string }> = {
  Pending:  { bg: '#FEF3C7', bgD: '#78350F33', text: '#D97706' },
  Approved: { bg: '#DCFCE7', bgD: '#14532D33', text: '#15803D' },
  Rejected: { bg: '#FEE2E2', bgD: '#7F1D1D33', text: '#DC2626' },
};

function fmt(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function LeavesPage() {
  const { theme }             = useTheme();
  const [mounted, setMounted] = useState(false);
  const [status,  setStatus]  = useState('');
  const [leaves,  setLeaves]  = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [actId,   setActId]   = useState<string | null>(null);
  const [action,  setAction]  = useState<'approve' | 'reject' | null>(null);
  const [reason,  setReason]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  useEffect(() => { setMounted(true); }, []);

  const load = () => {
    setLoading(true);
    const q = status ? `?status=${status}` : '';
    principalApi.get(`/api/principal/leaves${q}`)
      .then(r => setLeaves(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const dark = mounted && theme === 'dark';

  function openAction(id: string, a: 'approve' | 'reject') {
    setActId(id); setAction(a); setReason(''); setErrMsg('');
  }

  async function confirm() {
    if (!actId || !action) return;
    if (action === 'reject' && !reason.trim()) return setErrMsg('A reason is required when rejecting.');
    setSaving(true); setErrMsg('');
    try {
      await principalApi.patch(`/api/principal/leaves/${actId}/${action}`,
        action === 'reject' ? { reason: reason.trim() } : {});
      setActId(null); setAction(null);
      load();
    } catch (e: unknown) {
      setErrMsg((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update.');
    } finally { setSaving(false); }
  }

  const pending = leaves.filter(l => l.status === 'Pending').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A' }}>Leave Requests</h2>
          {pending > 0 && (
            <p style={{ fontSize: 13, color: '#D97706', marginTop: 2 }}>{pending} pending request{pending !== 1 ? 's' : ''}</p>
          )}
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{
            border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        >
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>Loading…</div>
      ) : leaves.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>No leave requests found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {leaves.map(l => {
            const ss = STATUS_STYLES[l.status] ?? STATUS_STYLES.Pending;
            return (
              <div key={l.id} style={{
                background: dark ? '#1E293B' : '#FFFFFF',
                border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
                borderRadius: 14, padding: '16px 20px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: dark ? '#F1F5F9' : '#0F172A', marginBottom: 2 }}>
                      {l.teacher_name}
                    </div>
                    <div style={{ fontSize: 12, color: dark ? '#64748B' : '#94A3B8' }}>
                      {l.teacher_code} · {l.department || 'No Department'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, background: dark ? ss.bgD : ss.bg,
                    color: ss.text, borderRadius: 20, padding: '4px 12px',
                  }}>
                    {l.status}
                  </span>
                </div>

                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: 13 }}>
                  <span style={{ color: dark ? '#64748B' : '#94A3B8' }}>Type</span>
                  <span style={{ color: dark ? '#CBD5E1' : '#374151', fontWeight: 500 }}>{l.type}</span>
                  <span style={{ color: dark ? '#64748B' : '#94A3B8' }}>Dates</span>
                  <span style={{ color: dark ? '#CBD5E1' : '#374151', fontWeight: 500 }}>
                    {fmt(l.date_from)} – {fmt(l.date_to)}
                  </span>
                  <span style={{ color: dark ? '#64748B' : '#94A3B8' }}>Reason</span>
                  <span style={{ color: dark ? '#CBD5E1' : '#374151' }}>{l.reason}</span>
                  {l.rejection_reason && (
                    <>
                      <span style={{ color: '#DC2626' }}>Reject reason</span>
                      <span style={{ color: '#DC2626' }}>{l.rejection_reason}</span>
                    </>
                  )}
                  <span style={{ color: dark ? '#64748B' : '#94A3B8' }}>Requested</span>
                  <span style={{ color: dark ? '#475569' : '#94A3B8', fontSize: 12 }}>{fmt(l.created_at)}</span>
                </div>

                {l.status === 'Pending' && (
                  <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => openAction(l.id, 'approve')}
                      style={{
                        padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: '#10B981', color: '#FFFFFF', border: 'none', cursor: 'pointer',
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => openAction(l.id, 'reject')}
                      style={{
                        padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: dark ? '#7F1D1D33' : '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action confirmation overlay */}
      {actId && action && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', padding: 16,
        }}>
          <div style={{
            background: dark ? '#1E293B' : '#FFFFFF', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A', marginBottom: 12 }}>
              {action === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
            </h3>

            {action === 'approve' && (
              <p style={{ fontSize: 13, color: dark ? '#94A3B8' : '#64748B', marginBottom: 20 }}>
                This will approve the teacher's leave request.
              </p>
            )}

            {action === 'reject' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', display: 'block', marginBottom: 6 }}>
                  REJECTION REASON (REQUIRED)
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box', border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
                    background: dark ? '#0F172A' : '#F8FAFC', color: dark ? '#F1F5F9' : '#0F172A',
                    borderRadius: 8, padding: '8px 12px', fontSize: 13, resize: 'vertical',
                  }}
                  placeholder="Explain why the request is being rejected…"
                />
              </div>
            )}

            {errMsg && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{errMsg}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setActId(null); setAction(null); }}
                disabled={saving}
                style={{
                  flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: dark ? '#334155' : '#F1F5F9', color: dark ? '#CBD5E1' : '#475569',
                  border: 'none', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={saving}
                style={{
                  flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: action === 'approve' ? '#10B981' : '#DC2626',
                  color: '#FFFFFF', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? '…' : action === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
