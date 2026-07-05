'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Student {
  id: string; admission_number: string; surname: string; other_names: string | null;
  sex: string | null; class_name: string; status: string; date_of_birth: string | null;
  father_phone: string | null; mother_phone: string | null; guardian_phone: string | null;
  nhis_number: string | null; blood_group: string | null;
}

interface ClassItem { id: string; class_name: string; }
const REGIONS = ['Ahafo','Ashanti','Bono','Bono East','Central','Eastern','Greater Accra','North East','Northern','Oti','Savannah','Upper East','Upper West','Volta','Western','Western North'];
const RELIGIONS = ['Christian','Muslim','Traditionalist','No Religion','Other'];
const BLOOD_GROUPS = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];
const GENOTYPES = ['AA','AS','SS','AC'];
const EDU_LEVELS = ['No formal education','Primary','JHS','SHS','Tertiary'];

const EMPTY_FORM = {
  admission_number:'', surname:'', other_names:'', preferred_name:'', date_of_birth:'',
  sex:'', nationality:'Ghanaian', religion:'', hometown:'', district_of_origin:'',
  region_of_origin:'', residential_address:'',
  birth_certificate_no:'', ghana_card_no:'', nhis_number:'',
  blood_group:'', genotype:'', known_conditions:'',
  immunization_bcg: false, immunization_dpt: false, immunization_polio: false, immunization_measles: false,
  class_name:'', date_of_admission:'', previous_school:'', previous_class:'', status:'Active',
  father_name:'', father_occupation:'', father_education:'', father_phone:'', father_alive: true,
  mother_name:'', mother_occupation:'', mother_education:'', mother_phone:'', mother_alive: true,
  guardian_name:'', guardian_relationship:'', guardian_occupation:'', guardian_phone:'', guardian_address:'',
  emergency_contact_name:'', emergency_contact_phone:'', emergency_contact_relationship:'',
};

type FormState = typeof EMPTY_FORM;

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

  // Import / Update modal state
  const [importModal,   setImportModal]   = useState(false);
  const [updateModal,   setUpdateModal]   = useState(false);
  const [impFile,       setImpFile]       = useState<File | null>(null);
  const [updFile,       setUpdFile]       = useState<File | null>(null);
  const [impLoading,    setImpLoading]    = useState(false);
  const [impResult,     setImpResult]     = useState<{ inserted?: number; updated?: number; errors: string[] } | null>(null);
  const impFileRef = useRef<HTMLInputElement>(null);
  const updFileRef = useRef<HTMLInputElement>(null);

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
    setEditing(null); setForm(EMPTY_FORM); setSaveError(''); setShowForm(true);
  }
  async function openEdit(s: Student) {
    setSaveError(''); setEditing(s);
    try {
      const { data } = await api.get(`/api/primary/students/${s.id}`);
      setForm({ ...EMPTY_FORM, ...data,
        date_of_birth: data.date_of_birth?.slice(0,10) ?? '',
        date_of_admission: data.date_of_admission?.slice(0,10) ?? '',
        father_alive: data.father_alive !== false,
        mother_alive: data.mother_alive !== false,
      });
    } catch { setForm({ ...EMPTY_FORM, ...s, other_names: s.other_names ?? '', sex: s.sex ?? '', date_of_birth: s.date_of_birth?.slice(0,10) ?? '', father_phone: s.father_phone ?? '', mother_phone: s.mother_phone ?? '', guardian_phone: s.guardian_phone ?? '', nhis_number: s.nhis_number ?? '', blood_group: s.blood_group ?? '' }); }
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
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `primary_students_${mode}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Failed to download template.'); }
  }

  async function submitImport() {
    if (!impFile) return;
    setImpLoading(true); setImpResult(null);
    try {
      const fd = new FormData();
      fd.append('file', impFile);
      const { data } = await api.post('/api/primary/students/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImpResult({ inserted: data.inserted, errors: data.errors ?? [] });
      if (!data.errors?.length) { load(); }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setImpResult({ errors: [msg ?? 'Upload failed.'] });
    } finally { setImpLoading(false); }
  }

  async function submitUpdate() {
    if (!updFile) return;
    setImpLoading(true); setImpResult(null);
    try {
      const fd = new FormData();
      fd.append('file', updFile);
      const { data } = await api.post('/api/primary/students/bulk-update', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImpResult({ updated: data.updated, errors: data.errors ?? [] });
      if (!data.errors?.length) { load(); }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setImpResult({ errors: [msg ?? 'Update failed.'] });
    } finally { setImpLoading(false); }
  }

  const F = (label: string, field: keyof FormState, type = 'text', opts?: string[]) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {opts ? (
        <select value={String(form[field])} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">Select…</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={String(form[field])} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      )}
    </div>
  );

  const CB = (label: string, field: keyof FormState) => (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={!!form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.checked }))}
        className="rounded border-slate-300" />
      <span className="text-slate-700">{label}</span>
    </label>
  );

  const SectionHead = ({ title }: { title: string }) => (
    <div className="col-span-full border-b border-slate-100 pb-1 mt-2">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{title}</p>
    </div>
  );

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
                  {['Adm. No.','Name','Class','Sex','Status','Contact','Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
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
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">No students found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-bold text-slate-900">{editing ? 'Edit Student' : 'Add Student'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <SectionHead title="Personal Information" />
              {F('Admission Number *', 'admission_number')}
              {F('Surname *', 'surname')}
              {F('Other Names', 'other_names')}
              {F('Preferred Name', 'preferred_name')}
              {F('Date of Birth', 'date_of_birth', 'date')}
              {F('Sex', 'sex', 'text', ['Male','Female'])}
              {F('Nationality', 'nationality')}
              {F('Religion', 'religion', 'text', RELIGIONS)}
              {F('Hometown', 'hometown')}
              {F('District of Origin', 'district_of_origin')}
              {F('Region of Origin', 'region_of_origin', 'text', REGIONS)}
              <div className="col-span-full">{F('Residential Address', 'residential_address')}</div>

              <SectionHead title="Identification" />
              {F('Birth Certificate No.', 'birth_certificate_no')}
              {F('Ghana Card No.', 'ghana_card_no')}
              {F('NHIS Number', 'nhis_number')}

              <SectionHead title="Health" />
              {F('Blood Group', 'blood_group', 'text', BLOOD_GROUPS)}
              {F('Genotype', 'genotype', 'text', GENOTYPES)}
              <div className="col-span-full">{F('Known Conditions / Allergies', 'known_conditions')}</div>
              <div className="col-span-full">
                <p className="text-xs font-semibold text-slate-600 mb-2">Immunizations</p>
                <div className="grid grid-cols-2 gap-2">
                  {CB('BCG', 'immunization_bcg')}
                  {CB('DPT', 'immunization_dpt')}
                  {CB('Polio/OPV', 'immunization_polio')}
                  {CB('Measles', 'immunization_measles')}
                </div>
              </div>

              <SectionHead title="Admission" />
              {F('Class *', 'class_name', 'text', classes.map(c => c.class_name))}
              {F('Date of Admission', 'date_of_admission', 'date')}
              {F('Status', 'status', 'text', ['Active','Withdrawn','Transferred','Graduated'])}
              {F('Previous School', 'previous_school')}
              {F('Previous Class', 'previous_class')}

              <SectionHead title="Father's Details" />
              {F("Father's Full Name", 'father_name')}
              {F("Father's Occupation", 'father_occupation')}
              {F("Father's Education", 'father_education', 'text', EDU_LEVELS)}
              {F("Father's Phone", 'father_phone', 'tel')}
              <div className="col-span-full">{CB('Father is alive', 'father_alive')}</div>

              <SectionHead title="Mother's Details" />
              {F("Mother's Full Name", 'mother_name')}
              {F("Mother's Occupation", 'mother_occupation')}
              {F("Mother's Education", 'mother_education', 'text', EDU_LEVELS)}
              {F("Mother's Phone", 'mother_phone', 'tel')}
              <div className="col-span-full">{CB('Mother is alive', 'mother_alive')}</div>

              <SectionHead title="Guardian (if applicable)" />
              {F("Guardian's Name", 'guardian_name')}
              {F("Relationship", 'guardian_relationship')}
              {F("Guardian's Occupation", 'guardian_occupation')}
              {F("Guardian's Phone", 'guardian_phone', 'tel')}
              <div className="col-span-full">{F("Guardian's Address", 'guardian_address')}</div>

              <SectionHead title="Emergency Contact" />
              {F("Contact Name", 'emergency_contact_name')}
              {F("Contact Phone", 'emergency_contact_phone', 'tel')}
              {F("Relationship", 'emergency_contact_relationship')}
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
                <p className="text-xs text-slate-400">Rows with a blank Admission No. will be auto-numbered using the prefix and year set in <span className="font-semibold text-slate-500">School Settings → Student Admission Numbers</span>.</p>
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
