'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface Notice {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'urgent';
  author_name: string;
  is_pinned: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FormState {
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'urgent';
  is_pinned: boolean;
  expires_at: string;
}

const EMPTY_FORM: FormState = { title: '', body: '', priority: 'normal', is_pinned: false, expires_at: '' };

const PRIORITY_STYLE: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  urgent:    { bg: '#FEF2F2', border: '#FECACA', badge: '#DC2626', text: '#991B1B' },
  important: { bg: '#FFFBEB', border: '#FDE68A', badge: '#D97706', text: '#92400E' },
  normal:    { bg: '#EFF6FF', border: '#BFDBFE', badge: '#2563EB', text: '#1E40AF' },
};

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isExpired(n: Notice) {
  return !!n.expires_at && n.expires_at < new Date().toISOString().slice(0, 10);
}

// ── Notice Form ───────────────────────────────────────────────────────────────

function NoticeForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormState;
  onSave: (data: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial);

  function set(k: keyof FormState, v: string | boolean) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm mb-6">
      <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">
        {initial.title ? 'Edit Notice' : 'New Notice'}
      </h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Title *</label>
          <input
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Notice title…"
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Body *</label>
          <textarea
            value={form.body}
            onChange={e => set('body', e.target.value)}
            placeholder="Full notice text…"
            rows={4}
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={e => set('priority', e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Expires (optional)</label>
            <input
              type="date"
              value={form.expires_at}
              onChange={e => set('expires_at', e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={e => set('is_pinned', e.target.checked)}
                className="w-4 h-4 accent-green-600 rounded"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">📌 Pin this notice</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim() || !form.body.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: '#15803D' }}
          >
            {saving ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Saving…</>
            ) : 'Save Notice'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NoticeBoardPage() {
  const [notices,   setNotices]   = useState<Notice[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [creating,  setCreating]  = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    api.get<Notice[]>('/api/notices/all')
      .then(r => setNotices(r.data))
      .catch(() => setError('Failed to load notices.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(form: FormState) {
    setSaving(true); setError('');
    try {
      const body = {
        title: form.title,
        body: form.body,
        priority: form.priority,
        is_pinned: form.is_pinned,
        expires_at: form.expires_at || null,
      };
      const r = await api.post<Notice>('/api/notices', body);
      setNotices(prev => [r.data, ...prev]);
      setCreating(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to create notice.');
    } finally { setSaving(false); }
  }

  async function handleEdit(id: string, form: FormState) {
    setSaving(true); setError('');
    try {
      const body = {
        title: form.title,
        body: form.body,
        priority: form.priority,
        is_pinned: form.is_pinned,
        expires_at: form.expires_at || null,
      };
      const r = await api.put<Notice>(`/api/notices/${id}`, body);
      setNotices(prev => prev.map(n => n.id === id ? r.data : n));
      setEditingId(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to update notice.');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this notice?')) return;
    setDeleting(id); setError('');
    try {
      await api.delete(`/api/notices/${id}`);
      setNotices(prev => prev.filter(n => n.id !== id));
    } catch {
      setError('Failed to delete notice.');
    } finally { setDeleting(null); }
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Notice Board</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Post important notices visible on all user dashboards.
          </p>
        </div>
        {!creating && !editingId && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#15803D' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
              strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Notice
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Create form */}
      {creating && (
        <NoticeForm
          initial={EMPTY_FORM}
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
          saving={saving}
        />
      )}

      {/* Notice list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : notices.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No notices yet</p>
          <p className="text-xs text-slate-400 mt-1">Create your first notice to broadcast information to all staff.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(notice => {
            const s = PRIORITY_STYLE[notice.priority] ?? PRIORITY_STYLE.normal;
            const expired = isExpired(notice);
            const isEdit = editingId === notice.id;

            return (
              <div key={notice.id}>
                {isEdit ? (
                  <NoticeForm
                    initial={{
                      title: notice.title,
                      body: notice.body,
                      priority: notice.priority,
                      is_pinned: notice.is_pinned,
                      expires_at: notice.expires_at ?? '',
                    }}
                    onSave={form => handleEdit(notice.id, form)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                ) : (
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      backgroundColor: expired ? '#F8FAFC' : s.bg,
                      border: `1px solid ${expired ? '#E2E8F0' : s.border}`,
                      borderLeft: `4px solid ${expired ? '#CBD5E1' : s.badge}`,
                      opacity: expired ? 0.65 : 1,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {notice.is_pinned && <span className="text-sm">📌</span>}
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${s.badge}18`, color: s.badge }}
                          >
                            {notice.priority}
                          </span>
                          {expired && (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400">
                              Expired
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          {notice.title}
                        </p>
                        <p className="text-sm mt-1.5 text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {notice.body}
                        </p>
                        <p className="text-[10px] mt-2.5 text-slate-400">
                          Posted by {notice.author_name} · {new Date(notice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {notice.expires_at && ` · Expires ${fmtDate(notice.expires_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { setEditingId(notice.id); setCreating(false); }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(notice.id)}
                          disabled={deleting === notice.id}
                          className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                        >
                          {deleting === notice.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
