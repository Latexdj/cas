'use client';

// Manages Subject App links (Playlab AI) for Teacher Resources.
//   mode 'school': a school admin. Sees the shared list (can hide/show each
//                  app for their school) and adds/edits their own apps.
//   mode 'shared': the super admin. Manages the shared list every school sees,
//                  including the order of the forms.
// Draws its own controls so it fits both the admin portal (light) and the
// super-admin portal (dark), via the palette passed in.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosInstance } from 'axios';

export interface Palette {
  card: string; border: string; sunken: string;
  ink: string; ink2: string; muted: string;
  primary: string; onPrimary: string; link: string;
  good: string; goodBg: string; warn: string; warnBg: string; bad: string;
  inputBg: string;
}

export const LIGHT: Palette = {
  card: '#FFFFFF', border: '#E2D9CC', sunken: '#F4EFE6',
  ink: '#1C1208', ink2: '#4A3F32', muted: '#6E6253',
  primary: '#145C44', onPrimary: '#FFFFFF', link: '#145C44',
  good: '#145C44', goodBg: '#E8F4EE', warn: '#7A5A1E', warnBg: '#F7EDDA', bad: '#B91C1C',
  inputBg: '#FFFFFF',
};

interface Row {
  id: string; group_label: string; subject: string; url: string; is_active: boolean;
  group_sort_order: number; launches: number;
  scope?: 'shared' | 'school'; hidden?: boolean; schools?: number;
}

const EMPTY = { group_label: '', subject: '', url: '' };

function errMsg(e: unknown, fallback: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

export function SubjectAppsManager({ client, mode, P }: { client: AxiosInstance; mode: 'school' | 'shared'; P: Palette }) {
  const base = mode === 'school' ? '/api/teacher-resources/admin/subject-apps' : '/api/teacher-resources/shared/subject-apps';
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [search,  setSearch]  = useState('');
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [notice,  setNotice]  = useState('');

  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [form,    setForm]    = useState(EMPTY);
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await client.get<Row[]>(base); setRows(data); setLoadErr(''); }
    catch (e) { setLoadErr(errMsg(e, 'Could not load the subject apps.')); }
    finally { setLoading(false); }
  }, [client, base]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = q ? rows.filter(r => r.subject.toLowerCase().includes(q) || r.group_label.toLowerCase().includes(q)) : rows;
    const map = new Map<string, Row[]>();
    for (const r of shown) { if (!map.has(r.group_label)) map.set(r.group_label, []); map.get(r.group_label)!.push(r); }
    return [...map.entries()];
  }, [rows, search]);
  const groupLabels = useMemo(() => [...new Set(rows.map(r => r.group_label))], [rows]);

  function openNew() { setForm(EMPTY); setFormErr(''); setEditing('new'); }
  function openEdit(r: Row) { setForm({ group_label: r.group_label, subject: r.subject, url: r.url }); setFormErr(''); setEditing(r); }

  async function save() {
    setSaving(true); setFormErr('');
    try {
      if (editing === 'new') await client.post(base, form);
      else if (editing) await client.put(`${base}/${editing.id}`, form);
      setEditing(null); await load();
    } catch (e) { setFormErr(errMsg(e, 'Could not save the app.')); }
    finally { setSaving(false); }
  }

  async function patch(r: Row, body: Record<string, boolean>) {
    setBusyId(r.id); setNotice('');
    try { await client.patch(`${base}/${r.id}`, body); await load(); }
    catch (e) { setNotice(errMsg(e, 'Could not update the app.')); }
    finally { setBusyId(null); }
  }

  async function remove(r: Row) {
    setBusyId(r.id); setNotice('');
    try { await client.delete(`${base}/${r.id}`); setConfirmDel(null); await load(); }
    catch (e) { setNotice(errMsg(e, 'Could not delete the app.')); }
    finally { setBusyId(null); }
  }

  async function moveGroup(label: string, dir: -1 | 1) {
    const order = [...groupLabels];
    const i = order.indexOf(label), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    try { await client.patch('/api/teacher-resources/shared/groups/order', { labels: order }); await load(); }
    catch (e) { setNotice(errMsg(e, 'Could not reorder the forms.')); }
  }

  const btn = (kind: 'primary' | 'plain' | 'danger') => ({
    minHeight: 36, padding: '0 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: kind === 'plain' ? `1px solid ${P.border}` : 'none',
    background: kind === 'primary' ? P.primary : kind === 'danger' ? P.bad : 'transparent',
    color: kind === 'primary' || kind === 'danger' ? P.onPrimary : P.link,
  });
  const input = { width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 8, fontSize: 15, color: P.ink, background: P.inputBg, border: `1px solid ${P.border}`, boxSizing: 'border-box' as const };
  const pill = (fg: string, bg: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: fg, background: bg });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 14, color: P.muted, margin: 0, maxWidth: 640 }}>
          {mode === 'school'
            ? 'Teachers open these from Resources in the teacher portal. Shared apps come from CAS for every school: hide any your school doesn\'t use. Add your own Playlab apps too.'
            : 'The shared list every school sees (when Teacher Resources is on). Schools can hide apps they don\'t use and add their own.'}
        </p>
        <button type="button" style={btn('primary')} onClick={openNew}>Add app</button>
      </div>

      <input aria-label="Search subject apps" placeholder="Search by subject or form" value={search}
        onChange={e => setSearch(e.target.value)} style={{ ...input, maxWidth: 360 }} />

      {notice && <p role="alert" style={{ color: P.bad, fontSize: 14, margin: 0 }}>{notice}</p>}

      {loading ? <p style={{ color: P.muted, fontSize: 14 }}>Loading…</p>
        : loadErr ? <p style={{ color: P.bad, fontSize: 14 }}>{loadErr}</p>
        : rows.length === 0 ? <p style={{ color: P.muted, fontSize: 14 }}>No subject apps have been added yet.</p>
        : groups.length === 0 ? <p style={{ color: P.muted, fontSize: 14 }}>No app matches your search.</p>
        : groups.map(([label, items]) => (
          <section key={label} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 16px', background: P.sunken, borderBottom: `1px solid ${P.border}` }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: P.ink }}>{label} <span style={{ fontWeight: 400, color: P.muted }}>· {items.length}</span></h2>
              {mode === 'shared' && !search && (
                <span style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={btn('plain')} aria-label={`Move ${label} up`} onClick={() => moveGroup(label, -1)} disabled={groupLabels[0] === label}>↑</button>
                  <button type="button" style={btn('plain')} aria-label={`Move ${label} down`} onClick={() => moveGroup(label, 1)} disabled={groupLabels[groupLabels.length - 1] === label}>↓</button>
                </span>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: P.muted }}>
                    <th style={{ padding: '8px 16px', fontWeight: 600 }}>Subject</th>
                    {mode === 'school' && <th style={{ padding: '8px 16px', fontWeight: 600 }}>Source</th>}
                    <th style={{ padding: '8px 16px', fontWeight: 600 }}>Launches</th>
                    <th style={{ padding: '8px 16px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '8px 16px' }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map(r => {
                    const own = mode === 'shared' || r.scope === 'school';
                    const live = own ? r.is_active : !r.hidden;
                    return (
                      <tr key={r.id} style={{ borderTop: `1px solid ${P.border}`, opacity: live ? 1 : 0.7 }}>
                        <td style={{ padding: '10px 16px', color: P.ink, fontWeight: 600 }}>{r.subject}</td>
                        {mode === 'school' && <td style={{ padding: '10px 16px', color: P.ink2 }}>{r.scope === 'shared' ? 'Shared' : 'Your school'}</td>}
                        <td style={{ padding: '10px 16px', color: P.ink2 }}>
                          {r.launches}{mode === 'shared' && r.schools ? <span style={{ color: P.muted }}> · {r.schools} school{r.schools !== 1 ? 's' : ''}</span> : null}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {live ? <span style={pill(P.good, P.goodBg)}>{own ? 'On' : 'Shown'}</span>
                                : <span style={pill(P.warn, P.warnBg)}>{own ? 'Off' : 'Hidden'}</span>}
                        </td>
                        <td style={{ padding: '6px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {confirmDel === r.id ? (
                            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ color: P.ink2, fontSize: 13 }}>Delete {r.subject}?</span>
                              <button type="button" style={btn('danger')} disabled={busyId === r.id} onClick={() => remove(r)}>Delete</button>
                              <button type="button" style={btn('plain')} onClick={() => setConfirmDel(null)}>Cancel</button>
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', gap: 4 }}>
                              <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...btn('plain'), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Open</a>
                              {own && <button type="button" style={btn('plain')} onClick={() => openEdit(r)}>Edit</button>}
                              {own ? (
                                <button type="button" style={btn('plain')} disabled={busyId === r.id} onClick={() => patch(r, { is_active: !r.is_active })}>
                                  {r.is_active ? 'Turn off' : 'Turn on'}
                                </button>
                              ) : (
                                <button type="button" style={btn('plain')} disabled={busyId === r.id} onClick={() => patch(r, { hidden: !r.hidden })}>
                                  {r.hidden ? 'Show' : 'Hide'}
                                </button>
                              )}
                              {mode === 'school' && own && (
                                <button type="button" style={{ ...btn('plain'), color: P.bad }} onClick={() => setConfirmDel(r.id)}>Delete</button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      {editing && (
        <div role="dialog" aria-modal="true" aria-labelledby="sam-title"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ width: '100%', maxWidth: 460, background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 id="sam-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: P.ink }}>{editing === 'new' ? 'Add subject app' : 'Edit subject app'}</h2>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600, color: P.ink2 }}>
              Form or curriculum
              <input list="sam-groups" value={form.group_label} onChange={e => setForm(f => ({ ...f, group_label: e.target.value }))} placeholder="e.g. Form 1" style={input} />
              <datalist id="sam-groups">{groupLabels.map(g => <option key={g} value={g} />)}</datalist>
              <span style={{ fontWeight: 400, fontSize: 12, color: P.muted }}>Pick an existing one or type a new one. A new one goes at the end of the list.</span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600, color: P.ink2 }}>
              Subject
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Mathematics" style={input} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600, color: P.ink2 }}>
              Playlab link
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://www.playlab.ai/project/…" style={input} inputMode="url" />
              <span style={{ fontWeight: 400, fontSize: 12, color: P.muted }}>Must start with https:// and be on playlab.ai. Teachers never see the link itself.</span>
            </label>
            {formErr && <p role="alert" style={{ margin: 0, color: P.bad, fontSize: 14 }}>{formErr}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btn('plain')} onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" style={{ ...btn('primary'), opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
                {saving ? 'Saving…' : editing === 'new' ? 'Add app' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
