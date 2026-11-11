'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { buildSignListHtml, type SlRecipient, type SlSchool } from '@/lib/sign-list-print';
import { printHtml, printUploadedFile } from './print';

interface BatchSummary {
  id: string; title: string; recipient_type: 'student' | 'teacher';
  qty_per_person: number; recipient_count: number; total_quantity: number;
  filter_label: string | null; due_date: string | null; issued_at: string; created_by_name: string | null;
  signed_list_url: string | null; signed_list_filename: string | null; signed_list_mime: string | null;
  signed_list_uploaded_at: string | null;
  item_name: string; asset_tag: string | null; is_returnable: boolean;
}
interface BatchRecipient {
  transaction_id: string; created_at: string; name: string; quantity: number; person_id: string;
  student_code: string | null; class_name: string | null; residential_status: string | null;
  teacher_code: string | null; department: string | null; added_later: boolean;
}
interface BatchDetail extends BatchSummary {
  notes: string | null; filters: Record<string, string>;
  signed_list_uploaded_by: string | null;
  recipients: BatchRecipient[]; school: SlSchool;
}

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';
const cardCls  = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700';
const btnGhost = 'px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function errMsg(e: unknown, fallback: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

export function IssueRecordsPanel({
  apiClient, primary = '#145C44', initialBatchId = null,
}: {
  apiClient: AxiosInstance; primary?: string; initialBatchId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(initialBatchId);
  useEffect(() => { setOpenId(initialBatchId); }, [initialBatchId]);

  return openId
    ? <BatchDetailView apiClient={apiClient} primary={primary} id={openId} onBack={() => setOpenId(null)} />
    : <BatchList apiClient={apiClient} onOpen={setOpenId} />;
}

function BatchList({ apiClient, onOpen }: { apiClient: AxiosInstance; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      apiClient.get<BatchSummary[]>('/api/inventory/batches', { params: { search: search.trim() || undefined } })
        .then(r => setRows(r.data)).catch(() => {}).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [apiClient, search]);

  const shown = missingOnly ? rows.filter(r => !r.signed_list_url) : rows;
  const missingCount = rows.filter(r => !r.signed_list_url).length;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputCls} flex-1 min-w-[200px]`} placeholder="Search title, item or class…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 select-none cursor-pointer">
          <input type="checkbox" checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} className="w-4 h-4 accent-[#145C44]" />
          Missing signed sheet{missingCount ? ` (${missingCount})` : ''}
        </label>
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        {loading ? (
          <p className="p-5 text-sm text-center text-slate-400">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="p-5 text-sm text-center text-slate-400">
            {rows.length === 0 ? 'No bulk issues recorded yet.' : 'Nothing matches.'}
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {shown.map(b => (
              <button key={b.id} type="button" onClick={() => onOpen(b.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{b.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(b.issued_at)} · {b.recipient_count} {b.recipient_type === 'student' ? 'student(s)' : 'teacher(s)'} × {b.qty_per_person} = {b.total_quantity} {b.item_name}
                  </p>
                </div>
                {b.signed_list_url ? (
                  <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#E8F4EE] text-[#145C44] dark:bg-green-900/30 dark:text-[#2ab289]">Signed sheet attached</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">No signed sheet</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BatchDetailView({
  apiClient, primary, id, onBack,
}: {
  apiClient: AxiosInstance; primary: string; id: string; onBack: () => void;
}) {
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<'' | 'upload' | 'remove' | 'print'>('');
  const [sheetError, setSheetError] = useState('');
  const [showLate, setShowLate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    apiClient.get<BatchDetail>(`/api/inventory/batches/${id}`)
      .then(r => { setBatch(r.data); setLoadError(''); })
      .catch(e => setLoadError(errMsg(e, 'Could not load this record.')));
  }, [apiClient, id]);
  useEffect(() => { load(); }, [load]);

  if (loadError) return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className={btnGhost}>← All issue records</button>
      <p className="text-sm text-red-600">{loadError}</p>
    </div>
  );
  if (!batch) return <p className="p-5 text-sm text-slate-400">Loading…</p>;

  const isStudents = batch.recipient_type === 'student';
  const uploadedAt = batch.signed_list_uploaded_at ? new Date(batch.signed_list_uploaded_at) : null;
  const addedSinceUpload = uploadedAt
    ? batch.recipients.filter(r => new Date(r.created_at) > uploadedAt).length
    : 0;

  function toSl(r: BatchRecipient): SlRecipient {
    return {
      id: r.person_id, name: r.name,
      student_code: r.student_code ?? undefined, class_name: r.class_name ?? undefined,
      residential_status: r.residential_status ?? undefined,
      teacher_code: r.teacher_code ?? undefined, department: r.department ?? undefined,
    };
  }

  function printSheet(list: BatchRecipient[], suffix = '') {
    if (!batch || !list.length) return;
    const ok = printHtml(buildSignListHtml({
      title: batch.title + suffix, itemName: batch.item_name,
      issueDate: batch.issued_at.slice(0, 10), qtyPerPerson: String(batch.qty_per_person),
      notes: batch.notes ?? '', recipientType: isStudents ? 'students' : 'teachers',
      filterLabel: batch.filter_label ?? '', recipients: list.map(toSl), school: batch.school,
    }));
    if (!ok) setSheetError('Pop-ups are blocked — allow pop-ups for this site and try again.');
  }

  async function onFilePicked(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file || !batch) return;
    setSheetError('');
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSheetError('Use a PDF or a photo (JPG, PNG or WebP) of the signed sheet.'); return;
    }
    if (file.size > MAX_UPLOAD_BYTES) { setSheetError('File is too large (max 15 MB).'); return; }
    if (batch.signed_list_url && !confirm('Replace the signed sheet currently attached to this record?')) return;

    setBusy('upload');
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await apiClient.put(`/api/inventory/batches/${batch.id}/signed-list`,
        { file_data: dataUri, filename: file.name }, { timeout: 180000 });
      load();
    } catch (e) {
      setSheetError(errMsg(e, 'Upload failed. Check your connection and try again.'));
    } finally { setBusy(''); }
  }

  async function removeSheet() {
    if (!batch || !confirm('Remove the signed sheet from this record? You can upload a new one afterwards.')) return;
    setBusy('remove'); setSheetError('');
    try {
      await apiClient.delete(`/api/inventory/batches/${batch.id}/signed-list`);
      load();
    } catch (e) { setSheetError(errMsg(e, 'Could not remove the sheet.')); }
    finally { setBusy(''); }
  }

  async function printUploaded() {
    if (!batch?.signed_list_url) return;
    setBusy('print');
    try { await printUploadedFile(batch.signed_list_url, batch.signed_list_mime); }
    finally { setBusy(''); }
  }

  const late = batch.recipients.filter(r => r.added_later);

  return (
    <div className="space-y-4 max-w-4xl">
      <button type="button" onClick={onBack} className={btnGhost}>← All issue records</button>

      <div className={`${cardCls} p-4 space-y-1`}>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{batch.title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {batch.recipient_count} {isStudents ? 'student(s)' : 'teacher(s)'} × {batch.qty_per_person} ={' '}
          <span className="font-semibold">{batch.total_quantity}</span> {batch.item_name}
          {batch.asset_tag ? ` (${batch.asset_tag})` : ''}
        </p>
        <p className="text-xs text-slate-400">
          Issued {fmtDateTime(batch.issued_at)}{batch.created_by_name ? ` by ${batch.created_by_name}` : ''}
          {batch.filter_label ? ` · ${batch.filter_label}` : ''}
        </p>
        {batch.is_returnable && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Returnable — tracked under Loans{batch.due_date ? `, due back ${fmtDate(batch.due_date)}` : ''}.
          </p>
        )}
        {batch.notes && <p className="text-xs text-slate-500 dark:text-slate-400">{batch.notes}</p>}
      </div>

      {/* Signed sheet */}
      <div className={`${cardCls} p-4 space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800 dark:text-white">Signed sheet</p>
          {batch.signed_list_url
            ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#E8F4EE] text-[#145C44] dark:bg-green-900/30 dark:text-[#2ab289]">Attached</span>
            : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Not uploaded</span>}
        </div>

        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
          onChange={e => onFilePicked(e.target.files?.[0])} />

        {batch.signed_list_url ? (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-300 break-all">
              {batch.signed_list_filename}
              <span className="block text-xs text-slate-400">
                Uploaded {batch.signed_list_uploaded_at ? fmtDateTime(batch.signed_list_uploaded_at) : ''}
                {batch.signed_list_uploaded_by ? ` by ${batch.signed_list_uploaded_by}` : ''}
              </span>
            </p>
            {addedSinceUpload > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                {addedSinceUpload} {addedSinceUpload === 1 ? 'person was' : 'people were'} added after this sheet was uploaded. Upload an updated signed sheet so it matches the record.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <a href={batch.signed_list_url} target="_blank" rel="noopener noreferrer" className={btnGhost}>View</a>
              <button type="button" onClick={printUploaded} disabled={!!busy} className={btnGhost}>
                {busy === 'print' ? 'Preparing…' : 'Print'}
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className={btnGhost}>
                {busy === 'upload' ? 'Uploading…' : 'Replace'}
              </button>
              <button type="button" onClick={removeSheet} disabled={!!busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40">
                {busy === 'remove' ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
            className="w-full py-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:border-slate-400 disabled:opacity-50">
            {busy === 'upload' ? 'Uploading…' : 'Upload signed sheet (PDF or photo)'}
          </button>
        )}
        {sheetError && <p className="text-sm text-red-600">{sheetError}</p>}
      </div>

      {/* Recipients */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-sm font-bold text-slate-800 dark:text-white">Recipients ({batch.recipients.length})</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => printSheet(batch.recipients)} className={btnGhost}>Print sign sheet</button>
            {late.length > 0 && (
              <button type="button" onClick={() => printSheet(late, ' (late collection)')} className={btnGhost}>
                Print late collectors only
              </button>
            )}
            <button type="button" onClick={() => setShowLate(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: primary }}>
              {showLate ? 'Close' : '+ Add late collectors'}
            </button>
          </div>
        </div>

        {showLate && (
          <LateCollectors apiClient={apiClient} primary={primary} batch={batch}
            onAdded={() => { setShowLate(false); load(); }} />
        )}

        <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
          {batch.recipients.map((r, i) => (
            <div key={r.transaction_id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-8 text-xs text-slate-400 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 dark:text-white truncate">{r.name}</p>
                <p className="text-xs text-slate-400">
                  {isStudents ? `${r.student_code ?? ''} · ${r.class_name ?? ''}` : `${r.teacher_code ?? ''}${r.department ? ` · ${r.department}` : ''}`}
                </p>
              </div>
              {r.added_later && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shrink-0"
                  title={`Collected ${fmtDateTime(r.created_at)}`}>
                  Late · {fmtDate(r.created_at)}
                </span>
              )}
              <span className="text-xs text-slate-500 shrink-0">× {r.quantity}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LateCollectors({
  apiClient, primary, batch, onAdded,
}: {
  apiClient: AxiosInstance; primary: string; batch: BatchDetail; onAdded: () => void;
}) {
  const [candidates, setCandidates] = useState<SlRecipient[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const already = new Set(batch.recipients.map(r => r.person_id));
    const params = {
      ...batch.filters,
      recipient_type: batch.recipient_type === 'student' ? 'students' : 'teachers',
    };
    apiClient.get<{ recipients: SlRecipient[] }>('/api/inventory/sign-list/recipients', { params })
      .then(r => setCandidates(r.data.recipients.filter(x => !already.has(x.id))))
      .catch(e => { setCandidates([]); setError(errMsg(e, 'Could not load the list.')); });
  }, [apiClient, batch]);

  const visible = (candidates ?? []).filter(r => {
    const q = search.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || (r.student_code ?? r.teacher_code ?? '').toLowerCase().includes(q);
  });

  async function add() {
    if (!selected.size) return;
    const n = selected.size;
    if (!confirm(`Issue ${batch.qty_per_person} × ${batch.item_name} to ${n} more ${n === 1 ? 'person' : 'people'} (${n * batch.qty_per_person} in total)?`)) return;
    setSaving(true); setError('');
    try {
      await apiClient.post(`/api/inventory/batches/${batch.id}/recipients`, { recipient_ids: [...selected] }, { timeout: 60000 });
      onAdded();
    } catch (e) { setError(errMsg(e, 'Failed to add.')); }
    finally { setSaving(false); }
  }

  return (
    <div className="px-4 py-3 space-y-2 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        People from the same list ({batch.filter_label || 'original filters'}) who haven&apos;t collected yet. Tick those collecting now.
      </p>
      {candidates === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{error || 'Everyone on this list has already collected.'}</p>
      ) : (
        <>
          <input className={inputCls} placeholder="Search name or code…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {visible.map(r => (
              <label key={r.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <input type="checkbox" checked={selected.has(r.id)} className="w-4 h-4 accent-[#145C44] shrink-0"
                  onChange={() => setSelected(prev => {
                    const next = new Set(prev);
                    if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                    return next;
                  })} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-800 dark:text-white truncate">{r.name}</span>
                  <span className="block text-xs text-slate-400">
                    {batch.recipient_type === 'student' ? `${r.student_code ?? ''} · ${r.class_name ?? ''}` : `${r.teacher_code ?? ''}`}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" onClick={add} disabled={saving || !selected.size}
            className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: primary }}>
            {saving ? 'Issuing…' : `Issue to ${selected.size} late collector${selected.size === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </div>
  );
}
