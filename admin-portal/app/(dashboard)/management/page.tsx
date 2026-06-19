'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface ManagementUser {
  id: string;
  name: string;
  role: 'principal' | 'vice_principal';
  management_code: string;
  is_active: boolean;
  created_at: string;
}

const ROLES = [
  { value: 'principal',      label: 'Principal / Headmaster' },
  { value: 'vice_principal', label: 'Vice Principal / Assistant Headmaster' },
];

function roleLabel(r: string) {
  return ROLES.find(x => x.value === r)?.label ?? r;
}

type FormRole = 'principal' | 'vice_principal';
interface FormState { name: string; role: FormRole; management_code: string; pin: string; }
const EMPTY_FORM: FormState = { name: '', role: 'principal', management_code: '', pin: '' };

export default function ManagementUsersPage() {
  const [users,    setUsers]    = useState<ManagementUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [open,     setOpen]     = useState(false);
  const [editing,  setEditing]  = useState<ManagementUser | null>(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');
  const [delId,    setDelId]    = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/admin/management-users');
      setUsers(r.data);
    } catch { setError('Failed to load management users.'); }
    finally   { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErr('');
    setOpen(true);
  }
  function openEdit(u: ManagementUser) {
    setEditing(u);
    setForm({ name: u.name, role: u.role, management_code: u.management_code, pin: '' });
    setErr('');
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim())            return setErr('Name is required');
    if (!form.management_code.trim()) return setErr('Management code is required');
    if (!editing && !form.pin)        return setErr('PIN is required for new accounts');
    if (form.pin && (form.pin.length < 4 || form.pin.length > 8))
      return setErr('PIN must be 4–8 digits');
    setSaving(true); setErr('');
    try {
      const body: Record<string, string | boolean> = {
        name: form.name.trim(), role: form.role, management_code: form.management_code.trim(),
      };
      if (form.pin) body.pin = form.pin;
      if (editing) {
        await api.put(`/api/admin/management-users/${editing.id}`, body);
      } else {
        await api.post('/api/admin/management-users', body);
      }
      setOpen(false);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(msg || 'Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function toggleActive(u: ManagementUser) {
    try {
      await api.put(`/api/admin/management-users/${u.id}`, { is_active: !u.is_active });
      load();
    } catch { alert('Failed to update status.'); }
  }

  async function handleDelete() {
    if (!delId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/management-users/${delId}`);
      setDelId(null);
      load();
    } catch { alert('Failed to delete.'); }
    finally { setDeleting(false); }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Management Users</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Principals and Vice Principals who can log into the management portal.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">+ Add User</Button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : error ? (
        <div className="text-center py-16 text-red-500">{error}</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No management users yet</p>
          <p className="text-sm mt-1">Click "Add User" to create the first one.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Management Code</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Status</th>
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
                      {u.management_code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.is_active
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setDelId(u.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Edit Management User' : 'Add Management User'}>
        <div className="space-y-4 mt-2">
          {err && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{err}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
            <input
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. John Mensah"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as FormRole }))}
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Management Code</label>
            <input
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono uppercase"
              value={form.management_code}
              onChange={e => setForm(f => ({ ...f, management_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. PRIN01"
            />
            <p className="text-xs text-gray-400 mt-1">Unique code used with PIN to log in to the management portal.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              PIN {editing && <span className="font-normal text-gray-400">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
              placeholder="4–8 digit PIN"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!delId} onClose={() => setDelId(null)} title="Delete Management User">
        <div className="mt-2 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This will permanently remove the management user. They will no longer be able to log in.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDelId(null)} disabled={deleting}>Cancel</Button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
