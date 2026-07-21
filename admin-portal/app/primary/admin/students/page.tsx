'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface Student {
  id: string; admission_number: string; surname: string; other_names: string | null;
  sex: string | null; class_name: string; status: string; date_of_birth: string | null;
  father_phone: string | null; mother_phone: string | null; guardian_phone: string | null;
  nhis_number: string | null; blood_group: string | null; picture_url: string | null;
}

interface ClassItem { id: string; class_name: string; }

const BLOOD_GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];

const EMPTY_FORM = {
  // Shown in form
  admission_number:'', surname:'', other_names:'', date_of_birth:'', sex:'',
  class_name:'', status:'Active', date_of_admission:'', previous_school:'',
  nhis_number:'', blood_group:'',
  father_name:'', father_phone:'',
  mother_name:'', mother_phone:'',
  guardian_name:'', guardian_phone:'',
  picture_data:'',
  // Hidden — preserved on edit so bulk-imported data isn't wiped
  preferred_name:'', nationality:'Ghanaian', religion:'', hometown:'',
  district_of_origin:'', region_of_origin:'', residential_address:'',
  birth_certificate_no:'', ghana_card_no:'', genotype:'', known_conditions:'',
  immunization_bcg: false, immunization_dpt: false, immunization_polio: false, immunization_measles: false,
  previous_class:'',
  father_occupation:'', father_education:'', father_alive: true,
  mother_occupation:'', mother_education:'', mother_alive: true,
  guardian_relationship:'', guardian_occupation:'', guardian_address:'',
  emergency_contact_name:'', emergency_contact_phone:'', emergency_contact_relationship:'',
};

type FormState = typeof EMPTY_FORM;

function compressToBase64(file: File, maxPx = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function PrimaryStudentsPage() {
  const [students,    setStudents]    = useState<Student[]>([]);
  const [classes,     setClasses]     = useState<ClassItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState<Student | null>(null);
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState('');
  const [photoPreview, setPhotoPreview] = useState('');

  const [importModal,  setImportModal]  = useState(false);
  const [updateModal,  setUpdateModal]  = useState(false);
  const [impFile,      setImpFile]      = useState<File | null>(null);
  const [updFile,      setUpdFile]      = useState<File | null>(null);
  const [impLoading,   setImpLoading]   = useState(false);
  const [impResult,    setImpResult]    = useState<{ inserted?: number; updated?: number; errors: string[] } | null>(null);
  const impFileRef = useRef<HTMLInputElement>(null);
  const updFileRef = useRef<HTMLInputElement>(null);
  const photoRef   = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterClass) params.class_name = filterClass;
      if (search)      params.search     = search;
      const { data } = await api.get<Student[]>('/api/primary/students', { params });
      setStudents(data);
    } catch { setError('Failed to load students.'); }
    finally { setLoading(false); }
  }, [filterClass, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<ClassItem[]>('/api/primary/classes').then(r => setClasses(r.data)).catch(() => {});
  }, []);

  function openAdd() {
    setEditing(null); setForm(EMPTY_FORM); setSaveError(''); setPhotoPreview(''); setShowForm(true);
  }

  async function openEdit(s: Student) {
    setSaveError(''); setEditing(s); setPhotoPreview(s.picture_url ?? '');
    try {
      const { data } = await api.get(`/api/primary/students/${s.id}`);
      setForm({ ...EMPTY_FORM, ...data,
        date_of_birth: data.date_of_birth?.slice(0,10) ?? '',
        date_of_admission: data.date_of_admission?.slice(0,10) ?? '',
        father_alive: data.father_alive !== false,
        mother_alive: data.mother_alive !== false,
        picture_data: '',
      });
    } catch {
      setForm({ ...EMPTY_FORM, ...s, other_names: s.other_names ?? '', sex: s.sex ?? '',
        date_of_birth: s.date_of_birth?.slice(0,10) ?? '',
        father_phone: s.father_phone ?? '', mother_phone: s.mother_phone ?? '',
        guardian_phone: s.guardian_phone ?? '', nhis_number: s.nhis_number ?? '',
        blood_group: s.blood_group ?? '', picture_data: '',
      });
    }
    setShowForm(true);
  }

  async function save() {
    if (!form.admission_number.trim() || !form.surname.trim() || !form.class_name) {
      setSaveError('Admission number, surname, and class are required.'); return;
    }
    setSaving(true); setSaveError('');
    try {
      if (editing) {
        await api.put(`/api/primary/students/${editing.id}`, form);
      } else {
        await api.post('/api/primary/students', form);
      }
      setShowForm(false); load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSaveError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this student? All their scores and attendance will also be removed.')) return;
    try { await api.delete(`/api/primary/students/${id}`); load(); }
    catch { setError('Delete failed.'); }
  }

  async function downloadTemplate(mode: 'empty' | 'populated') {
    try {
      const res = await api.get(`/api/primary/students-template?mode=${mode}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = `primary_students_${mode}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Failed to download template.'); }
  }

  async function submitImport() {
    if (!impFile) return;
    setImpLoading(true); setImpResult(null);
    try {
      const fd = new FormData(); fd.append('file', impFile);
      const { data } = await api.post('/api/primary/students/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImpResult({ inserted: data.inserted, errors: data.errors ?? [] });
      if (!data.errors?.length) load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setImpResult({ errors: [msg ?? 'Upload failed.'] });
    } finally { setImpLoading(false); }
  }

  async function submitUpdate() {
    if (!updFile) return;
    setImpLoading(true); setImpResult(null);
    try {
      const fd = new FormData(); fd.append('file', updFile);
      const { data } = await api.post('/api/primary/students/bulk-update', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImpResult({ updated: data.updated, errors: data.errors ?? [] });
      if (!data.errors?.length) load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setImpResult({ errors: [msg ?? 'Update failed.'] });
    } finally { setImpLoading(false); }
  }

  const f = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(s => ({ ...s, [k]: e.target.value }));

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600';
  const lbl = 'block text-xs font-semibold text-slate-500 mb-1';

  const photoSrc = form.picture_data || photoPreview;

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(students);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500 mt-0.5">{students.length} student{students.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setImpResult(null); setImpFile(null); if (impFileRef.current) impFileRef.current.value = ''; setImportModal(true); }}
            className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
            Import Students
          </button>
          <button onClick={() => { setImpResult(null); setUpdFile(null); setUpdateModal(true); }}
            className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
            Bulk Update
          </button>
          <button onClick={openAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#15803D' }}>
            + Add Student
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center shadow-sm">
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / admission no…"
          onKeyDown={e => e.key === 'Enter' && load()}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-52" />
        <button onClick={load} className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#15803D' }}>Apply</button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap" />
                  <Th label="Adm. No." sortKey="admission_number" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide" />
                  <Th label="Name" sortKey="surname" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide" />
                  <Th label="Class" sortKey="class_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide" />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Sex</th>
                  <Th label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide" />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Contact</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(displayRows as Student[]).map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 flex items-center justify-center">
                        {s.picture_url
                          ? <img src={s.picture_url} alt={s.surname} className="w-full h-full object-cover" />
                          : <span className="text-xs font-bold text-slate-400">{s.surname.charAt(0).toUpperCase()}</span>
                        }
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{s.admission_number}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{s.surname}{s.other_names ? `, ${s.other_names}` : ''}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{s.class_name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{s.sex ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.status === 'Active' ? 'text-green-700 bg-green-50' : 'text-slate-500 bg-slate-100'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{s.father_phone || s.mother_phone || s.guardian_phone || '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(s)} className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100">Edit</button>
                        <button onClick={() => del(s.id)} className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400 text-sm">No students found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} className="px-4" />
        </div>
      )}

      {/* Student Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-bold text-slate-900">{editing ? 'Edit Student' : 'Add Student'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Photo upload */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-100 flex-shrink-0 flex items-center justify-center">
                  {photoSrc
                    ? <img src={photoSrc} alt="Student" className="w-full h-full object-cover" />
                    : <span className="text-2xl font-bold text-slate-300">
                        {form.surname ? form.surname.charAt(0).toUpperCase() : '?'}
                      </span>
                  }
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-600">Student Photo</p>
                  <input ref={photoRef} type="file" accept="image/*" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const b64 = await compressToBase64(file);
                      setForm(s => ({ ...s, picture_data: b64 }));
                    }} />
                  <div className="flex gap-2">
                    <button onClick={() => photoRef.current?.click()}
                      className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
                      {photoSrc ? 'Change Photo' : 'Upload Photo'}
                    </button>
                    {photoSrc && (
                      <button onClick={() => { setForm(s => ({ ...s, picture_data: '' })); setPhotoPreview(''); }}
                        className="px-3 py-1.5 text-xs font-semibold border border-red-200 rounded-lg text-red-600 hover:bg-red-50">
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">JPG or PNG, auto-compressed to 400×400.</p>
                </div>
              </div>

              {/* Personal Information */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Personal Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className={lbl}>Admission Number *</label>
                    <input value={form.admission_number} onChange={f('admission_number')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Surname *</label>
                    <input value={form.surname} onChange={f('surname')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Other Names</label>
                    <input value={form.other_names} onChange={f('other_names')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Date of Birth</label>
                    <input type="date" value={form.date_of_birth} onChange={f('date_of_birth')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Sex</label>
                    <select value={form.sex} onChange={f('sex')} className={inp}>
                      <option value="">Select…</option>
                      <option>Male</option><option>Female</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Admission */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Admission</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Class *</label>
                    <select value={form.class_name} onChange={f('class_name')} className={inp}>
                      <option value="">Select…</option>
                      {classes.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Status</label>
                    <select value={form.status} onChange={f('status')} className={inp}>
                      <option>Active</option><option>Withdrawn</option>
                      <option>Transferred</option><option>Graduated</option>
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Date of Admission</label>
                    <input type="date" value={form.date_of_admission} onChange={f('date_of_admission')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Previous School</label>
                    <input value={form.previous_school} onChange={f('previous_school')} className={inp} />
                  </div>
                </div>
              </div>

              {/* Health */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Health</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>NHIS Number</label>
                    <input value={form.nhis_number} onChange={f('nhis_number')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Blood Group</label>
                    <select value={form.blood_group} onChange={f('blood_group')} className={inp}>
                      <option value="">Select…</option>
                      {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Parent / Guardian Contact */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Parent / Guardian Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Father&apos;s Name</label>
                    <input value={form.father_name} onChange={f('father_name')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Father&apos;s Phone</label>
                    <input type="tel" value={form.father_phone} onChange={f('father_phone')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Mother&apos;s Name</label>
                    <input value={form.mother_name} onChange={f('mother_name')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Mother&apos;s Phone</label>
                    <input type="tel" value={form.mother_phone} onChange={f('mother_phone')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Guardian&apos;s Name</label>
                    <input value={form.guardian_name} onChange={f('guardian_name')} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Guardian&apos;s Phone</label>
                    <input type="tel" value={form.guardian_phone} onChange={f('guardian_phone')} className={inp} />
                  </div>
                </div>
              </div>

            </div>

            {saveError && (
              <div className="mx-6 mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
            )}

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Saving…' : 'Save Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Students Modal */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Import Students</h2>
              <button onClick={() => setImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">Step 1 — Download the template</p>
                <button onClick={() => downloadTemplate('empty')} className="text-green-700 font-semibold hover:underline text-sm">
                  Download blank template (.xlsx)
                </button>
                <p className="text-xs text-slate-400">Rows with a blank Admission No. will be auto-numbered using the prefix set in School Settings.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Step 2 — Upload filled template</label>
                <input ref={impFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => setImpFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => impFileRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-500 hover:border-green-400 hover:text-green-700 text-center transition-colors">
                  {impFile ? impFile.name : 'Click to choose Excel file…'}
                </button>
              </div>
              {impResult && (
                <div className={`rounded-lg px-4 py-3 text-sm ${impResult.errors.length && !impResult.inserted ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
                  {impResult.inserted != null && <p className="font-semibold">{impResult.inserted} student(s) imported.</p>}
                  {impResult.errors.map((e, i) => <p key={i} className="text-xs mt-0.5">{e}</p>)}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setImportModal(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Close</button>
              <button onClick={submitImport} disabled={!impFile || impLoading}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {impLoading ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Update Modal */}
      {updateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Bulk Update Students</h2>
              <button onClick={() => setUpdateModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">Step 1 — Download the current data</p>
                <button onClick={() => downloadTemplate('populated')} className="text-green-700 font-semibold hover:underline text-sm">
                  Download populated template (.xlsx)
                </button>
                <p className="text-xs text-slate-400">Edit values in Excel (Admission No. is the key — do not change it). Leave cells blank to skip updating them.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Step 2 — Upload edited file</label>
                <input ref={updFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => setUpdFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => updFileRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-500 hover:border-green-400 hover:text-green-700 text-center transition-colors">
                  {updFile ? updFile.name : 'Click to choose Excel file…'}
                </button>
              </div>
              {impResult && (
                <div className={`rounded-lg px-4 py-3 text-sm ${impResult.errors.length && !impResult.updated ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
                  {impResult.updated != null && <p className="font-semibold">{impResult.updated} student(s) updated.</p>}
                  {impResult.errors.map((e, i) => <p key={i} className="text-xs mt-0.5">{e}</p>)}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setUpdateModal(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Close</button>
              <button onClick={submitUpdate} disabled={!updFile || impLoading}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {impLoading ? 'Updating…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
