'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface MgmtUser {
  id: string;
  name: string;
  teacher_code: string;
  department: string | null;
  role: 'principal' | 'vice_principal';
  status: string;
}

interface Teacher {
  id: string;
  name: string;
  teacher_code: string;
  department: string | null;
}

const ROLES = [
  { value: 'principal',      label: 'Principal / Headmaster' },
  { value: 'vice_principal', label: 'Vice Principal / Assistant Headmaster' },
];

function roleLabel(r: string) {
  return ROLES.find(x => x.value === r)?.label ?? r;
}

export default function ManagementUsersPage() {
  const [users,     setUsers]     = useState<MgmtUser[]>([]);
  const [teachers,  setTeachers]  = useState<Teacher[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [open,      setOpen]      = useState(false);
  const [editing,   setEditing]   = useState<MgmtUser | null>(null);
  const [teacherId, setTeacherId] = useState('');
  const [role,      setRole]      = useState<'principal' | 'vice_principal'>('principal');
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');
  const [revokeId,  setRevokeId]  = useState<string | null>(null);
  const [revoking,  setRevoking]  = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [mgmt, staff] = await Promise.all([
        api.get('/api/admin/management-users'),
        api.get('/api/teachers'),
      ]);
      setUsers(mgmt.data);
      setTeachers(staff.data);
    } catch { setError('Failed to load data.'); }
    finally  { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Teachers who don't already have a management role (for the dropdown)
  const assignedIds = new Set(users.map(u => u.id));
  const available   = teachers.filter(t => !assignedIds.has(t.id));

  function openCreate() {
    setEditing(null);
    setTeacherId(available[0]?.id ?? '');
    setRole('principal');
    setErr('');
    setOpen(true);
  }

  function openEdit(u: MgmtUser) {
    setEditing(u);
    setRole(u.role);
    setErr('');
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      if (editing) {
        await api.put(`/api/admin/management-users/${editing.id}`, { role });
      } else {
        if (!teacherId) return setErr('Please select a teacher');
        await api.post('/api/admin/management-users', { teacher_id: teacherId, role });
      }
      setOpen(false);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(msg || 'Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleRevoke() {
    if (!revokeId) return;
    setRevoking(true);
    try {
      await api.delete(`/api/admin/management-users/${revokeId}`);
      setRevokeId(null);
      load();
    } catch { alert('Failed to revoke access.'); }
    finally { setRevoking(false); }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Management Users</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Teaching staff with management portal access. They log in using their Teacher ID and PIN.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" disabled={available.length === 0}>+ Assign Role</Button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : error ? (
        <div className="text-center py-16 text-red-500">{error}</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No management users yet</p>
          <p className="text-sm mt-1">Click &quot;Assign Role&quot; to grant a teacher management access.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Teacher ID (Login)</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Department</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{roleLabel(u.role)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded text-xs">
                      {u.teacher_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.department || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => openEdit(u)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        Change Role
                      </button>
                      <button onClick={() => setRevokeId(u.id)} className="text-xs text-red-500 hover:underline">
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign / Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Change Management Role' : 'Assign Management Role'}>
        <div className="space-y-4 mt-2">
          {err && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}

          {!editing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Teacher</label>
              <select
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                value={teacherId}
                onChange={e => setTeacherId(e.target.value)}
              >
                {available.length === 0 ? (
                  <option value="">All teachers already have a role</option>
                ) : (
                  available.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.teacher_code}){t.department ? ` — ${t.department}` : ''}
                    </option>
                  ))
                )}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                They will log in to the management portal using their existing Teacher ID and PIN.
              </p>
            </div>
          )}

          {editing && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Changing role for <strong>{editing.name}</strong> ({editing.teacher_code})
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={role}
              onChange={e => setRole(e.target.value as 'principal' | 'vice_principal')}
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || (!editing && !teacherId)}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Assign Role'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revoke Confirmation */}
      <Modal open={!!revokeId} onClose={() => setRevokeId(null)} title="Revoke Management Access">
        <div className="mt-2 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This teacher will lose access to the management portal. Their teacher account and credentials are unaffected.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setRevokeId(null)} disabled={revoking}>Cancel</Button>
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
            >
              {revoking ? 'Revoking…' : 'Revoke Access'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
