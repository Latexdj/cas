'use client';

// Manages "Websites and tools" links for Teacher Resources.
//   mode 'school': school admin. Hide/show shared sites; add/edit own sites.
//   mode 'shared': super admin. The shared list every school sees.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { Palette } from './SubjectAppsManager';
import { SITE_CATEGORIES, siteDomain } from './categories';

interface Row {
  id: string; title: string; description: string | null; url: string; category: string; subjects: string[];
  is_active: boolean; launches: number; scope?: 'shared' | 'school'; hidden?: boolean; schools?: number;
}

const EMPTY = { title: '', description: '', url: '', category: '', subjects: [] as string[] };

function errMsg(e: unknown, fallback: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

export function WebsitesManager({ client, mode, P }: { client: AxiosInstance; mode: 'school' | 'shared'; P: Palette }) {
  const base = mode === 'school' ? '/api/teacher-resources/admin/websites' : '/api/teacher-resources/shared/websites';
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [search,  setSearch]  = useState('');
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [notice,  setNotice]  = useState('');
  const [schoolSubjects, setSchoolSubjects] = useState<string[]>([]);

  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [form,    setForm]    = useState(EMPTY);
  const [tag,     setTag]     = useState('');
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await client.get<Row[]>(base); setRows(data); setLoadErr(''); }
    catch (e) { setLoadErr(errMsg(e, 'Could not load the websites.')); }
    finally { setLoading(false); }
  }, [client, base]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (mode !== 'school') return;
    client.get<{ name: string }[]>('/api/subjects').then(r => setSchoolSubjects(r.data.map(s => s.name))).catch(() => {});
  }, [client, mode]);

  // Suggestions: the school's subjects plus any tags already used.
  const tagSuggestions = useMemo(
    () => [...new Set([...schoolSubjects, ...rows.flatMap(r => r.subjects)])].sort((a, b) => a.localeCompare(b)),
    [schoolSubjects, rows]
  );

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = q ? rows.filter(r => r.title.toLowerCase().includes(q) || siteDomain(r.url).includes(q) || r.subjects.some(s => s.toLowerCase().includes(q))) : rows;
    return SITE_CATEGORIES.map(c => [c.label, shown.filter(r => r.category === c.key)] as const).filter(([, items]) => items.length);
  }, [rows, search]);

  function openNew() { setForm(EMPTY); setTag(''); setFormErr(''); setEditing('new'); }
  function openEdit(r: Row) {
    setForm({ title: r.title, description: r.description ?? '', url: r.url, category: r.category, subjects: r.subjects });
    setTag(''); setFormErr(''); setEditing(r);
  }
  function addTag() {
    const t = tag.trim().replace(/\s+/g, ' ');
    if (t && !form.subjects.some(s => s.toLowerCase() === t.toLowerCase())) setForm(f => ({ ...f, subjects: [...f.subjects, t] }));
    setTag('');
  }

  async function save() {
    setSaving(true); setFormErr('');
    const pending = tag.trim();
    const body = { ...form, subjects: pending && !form.subjects.includes(pending) ? [...form.subjects, pending] : form.subjects };
    try {
      if (editing === 'new') await client.post(base, body);
      else if (editing) await client.put(`${base}/${editing.id}`, body);
      setEditing(null); await load();
    } catch (e) { setFormErr(errMsg(e, 'Could not save the website.')); }
    finally { setSaving(false); }
  }

  async function patch(r: Row, body: Record<string, boolean>) {
    setBusyId(r.id); setNotice('');
    try { await client.patch(`${base}/${r.id}`, body); await load(); }
    catch (e) { setNotice(errMsg(e, 'Could not update the website.')); }
    finally { setBusyId(null); }
  }

  async function remove(r: Row) {
    setBusyId(r.id); setNotice('');
    try { await client.delete(`${base}/${r.id}`); setConfirmDel(null); await load(); }
    catch (e) { setNotice(errMsg(e, 'Could not delete the website.')); }
    finally { setBusyId(null); }
  }

  const btn = (kind: 'primary' | 'plain' | 'danger') => ({
    minHeight: 36, padding: '0 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: kind === 'plain' ? `1px solid ${P.border}` : 'none',
    background: kind === 'primary' ? P.primary : kind === 'danger' ? P.bad : 'transparent',
    color: kind === 'primary' || kind === 'danger' ? P.onPrimary : P.link,
  });
  const input = { width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 8, fontSize: 15, color: P.ink, background: P.inputBg, border: `1px solid ${P.border}`, boxSizing: 'border-box' as const };
  const label = { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 14, fontWeight: 600, color: P.ink2 };
  const hint = { fontWeight: 400, fontSize: 12, color: P.muted };
  const pill = (fg: string, bg: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: fg, background: bg });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 14, color: P.muted, margin: 0, maxWidth: 640 }}>
          {mode === 'school'
            ? 'Websites teachers open from Resources. Shared sites come from CAS for every school: hide any your school doesn\'t use, and add your own.'
            : 'The shared websites every school sees. Schools can hide any and add their own.'}
        </p>
        <button type="button" style={btn('primary')} onClick={openNew}>Add website</button>
      </div>

      <input aria-label="Search websites" placeholder="Search by name, address or subject" value={search}
        onChange={e => setSearch(e.target.value)} style={{ ...input, maxWidth: 360 }} />

      {notice && <p role="alert" style={{ color: P.bad, fontSize: 14, margin: 0 }}>{notice}</p>}

      {loading ? <p style={{ color: P.muted, fontSize: 14 }}>Loading…</p>
        : loadErr ? <p style={{ color: P.bad, fontSize: 14 }}>{loadErr}</p>
        : rows.length === 0 ? <p style={{ color: P.muted, fontSize: 14 }}>No websites have been added yet.</p>
        : groups.length === 0 ? <p style={{ color: P.muted, fontSize: 14 }}>No website matches your search.</p>
        : groups.map(([cat, items]) => (
          <section key={cat} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: P.sunken, borderBottom: `1px solid ${P.border}` }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: P.ink }}>{cat} <span style={{ fontWeight: 400, color: P.muted }}>· {items.length}</span></h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: P.muted }}>
                    <th style={{ padding: '8px 16px', fontWeight: 600 }}>Website</th>
                    {mode === 'school' && <th style={{ padding: '8px 16px', fontWeight: 600 }}>Source</th>}
                    <th style={{ padding: '8px 16px', fontWeight: 600 }}>Opens</th>
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
                        <td style={{ padding: '10px 16px', minWidth: 220 }}>
                          <div style={{ color: P.ink, fontWeight: 600 }}>{r.title}</div>
                          <div style={{ color: P.muted, fontSize: 13 }}>
                            {siteDomain(r.url)}{r.subjects.length > 0 && ` · ${r.subjects.join(', ')}`}
                          </div>
                        </td>
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
                              <span style={{ color: P.ink2, fontSize: 13 }}>Delete {r.title}?</span>
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
                              {own && (
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
        <div role="dialog" aria-modal="true" aria-labelledby="wm-title"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 id="wm-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: P.ink }}>{editing === 'new' ? 'Add website' : 'Edit website'}</h2>
            <label style={label}>
              Name
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. NaCCA Curriculum Portal" style={input} />
            </label>
            <label style={label}>
              Website address
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" style={input} inputMode="url" />
              <span style={hint}>The full address, starting with https://. Teachers see the site&apos;s name and domain, for example nacca.gov.gh.</span>
            </label>
            <label style={label}>
              Category
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={input}>
                <option value="">Choose…</option>
                {SITE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
            <label style={label}>
              Description <span style={hint}>Optional, one short line</span>
              <input value={form.description} maxLength={200} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. SHS syllabuses and teacher manuals" style={input} />
            </label>
            <div style={label}>
              Subjects <span style={hint}>Optional. Leave empty if the site is for every subject.</span>
              {form.subjects.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {form.subjects.map(s => (
                    <span key={s} style={{ ...pill(P.ink2, P.sunken), display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      {s}
                      <button type="button" aria-label={`Remove ${s}`} onClick={() => setForm(f => ({ ...f, subjects: f.subjects.filter(x => x !== s) }))}
                        style={{ border: 'none', background: 'transparent', color: P.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input list="wm-subjects" value={tag} onChange={e => setTag(e.target.value)} placeholder="Type a subject"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} style={input} aria-label="Add a subject" />
                <button type="button" style={btn('plain')} onClick={addTag}>Add</button>
              </div>
              <datalist id="wm-subjects">{tagSuggestions.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            {formErr && <p role="alert" style={{ margin: 0, color: P.bad, fontSize: 14 }}>{formErr}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btn('plain')} onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" style={{ ...btn('primary'), opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>
                {saving ? 'Saving…' : editing === 'new' ? 'Add website' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
