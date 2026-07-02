'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface AcademicYear { id: string; name: string; is_current: boolean }
interface ExamRow {
  student_id: string;
  student_code: string;
  name: string;
  exam_id: string | null;
  score: number | null;
}
interface SubjectRemark { student_id: string; student_code: string; name: string; remarks: string; }

function ExamContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const subject    = sp.get('subject')    ?? '';
  const class_name = sp.get('class_name') ?? '';
  const year_id    = sp.get('year_id')    ?? '';
  const semester   = sp.get('semester')   ?? '';
  const year_name  = sp.get('year_name')  ?? '';

  const [primary, setPrimary] = useState('#2ab289');

  // Year / semester selectors — seeded from URL params, changeable on-page
  const [years,          setYears]          = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState(year_id);
  const [selectedSem,    setSelectedSem]    = useState(semester);

  const [rows,     setRows]    = useState<ExamRow[]>([]);
  const [scores,   setScores]  = useState<Record<string, string>>({});
  const [maxScore, setMaxScore] = useState('100');
  const [loading,  setLoading] = useState(true);
  const [saving,   setSaving]  = useState(false);
  const [saved,    setSaved]   = useState(false);
  const [error,    setError]   = useState('');
  const [subLocked,   setSubLocked]   = useState(false);
  const [subStatus,   setSubStatus]   = useState<string>('draft');
  const [subjRemarks,    setSubjRemarks]    = useState<SubjectRemark[]>([]);
  const [remarksDirty,   setRemarksDirty]   = useState(false);
  const [remarksSaving,  setRemarksSaving]  = useState(false);
  const [remarksExpanded, setRemarksExpanded] = useState(false);

  const inputRefs    = useRef<Record<string, HTMLInputElement | null>>({});
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading]       = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    saved: number; skipped: number; errors: { row: number; message: string }[];
  } | null>(null);

  const selectedYearName = years.find(y => y.id === selectedYearId)?.name ?? year_name;

  const load = useCallback(async () => {
    if (!selectedYearId || !selectedSem || !subject || !class_name) return;
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const { data } = await teacherApi.get<ExamRow[]>('/api/exam-scores', {
        params: { academic_year_id: selectedYearId, semester: selectedSem, subject, class_name },
      });
      setRows(data ?? []);
      const s: Record<string, string> = {};
      for (const r of (data ?? []) as ExamRow[]) {
        s[r.student_id] = r.score != null ? String(r.score) : '';
      }
      setScores(s);

      // Fetch submission lock status
      try {
        const { data: statuses } = await teacherApi.get<Array<{ subject: string; class_name: string; status: string }>>(
          `/api/result-submissions/my-status?academic_year_id=${selectedYearId}&semester=${selectedSem}`
        );
        const mine = statuses.find(s => s.subject === subject && s.class_name === class_name);
        const st = mine?.status ?? 'draft';
        setSubStatus(st);
        setSubLocked(['submitted', 'hod_approved', 'final_approved', 'published'].includes(st));
      } catch { /* non-fatal */ }

      // Fetch subject remarks
      try {
        const { data: rmks } = await teacherApi.get<SubjectRemark[]>(
          `/api/assessments/subject-remarks?academic_year_id=${selectedYearId}&semester=${selectedSem}&subject=${encodeURIComponent(subject)}&class_name=${encodeURIComponent(class_name)}`
        );
        setSubjRemarks(rmks.map(r => ({ ...r, remarks: r.remarks ?? '' })));
      } catch { /* non-fatal */ }
    } catch {
      setError('Failed to load exam scores.');
    } finally {
      setLoading(false);
    }
  }, [selectedYearId, selectedSem, subject, class_name]);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);

    // Fetch all academic years for the dropdowns
    teacherApi.get<AcademicYear[]>('/api/academic-years')
      .then(r => setYears(r.data ?? []))
      .catch(() => {});

    load();
  }, [load]);

  async function downloadExamTemplate() {
    try {
      const resp = await teacherApi.get('/api/exam-scores/template', {
        params: { academic_year_id: selectedYearId, semester: selectedSem, subject, class_name },
        responseType: 'blob',
        timeout: 30000,
      });
      const url = URL.createObjectURL(resp.data as Blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `${subject}_${class_name}_sem${selectedSem}_exam.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download template.');
    }
  }

  async function handleExamUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setError('');
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('academic_year_id', selectedYearId);
      form.append('semester', selectedSem);
      form.append('subject', subject);
      form.append('class_name', class_name);
      const { data } = await teacherApi.post<{
        saved: number; skipped: number; errors: { row: number; message: string }[];
      }>('/api/exam-scores/upload-scores', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      setUploadResult(data);
      await load();
    } catch (err: unknown) {
      const body = (err as { response?: { data?: { error?: string; saved?: number; skipped?: number; errors?: { row: number; message: string }[] } } })?.response?.data;
      setError(body?.error ?? 'Upload failed.');
      if (body?.errors?.length) {
        setUploadResult({ saved: body.saved ?? 0, skipped: body.skipped ?? 0, errors: body.errors });
      }
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload = rows.map(r => ({
        student_id: r.student_id,
        score: scores[r.student_id] !== '' ? parseFloat(scores[r.student_id]) : null,
      }));
      await teacherApi.post('/api/exam-scores', {
        academic_year_id: selectedYearId,
        semester:         parseInt(selectedSem),
        subject,
        class_name,
        max_score:        parseFloat(maxScore) || 100,
        scores:           payload,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function saveRemarks() {
    setRemarksSaving(true);
    try {
      await teacherApi.post('/api/assessments/subject-remarks', {
        academic_year_id: selectedYearId,
        semester: selectedSem,
        subject,
        class_name,
        remarks: subjRemarks.map(r => ({ student_id: r.student_id, remarks: r.remarks || null })),
      });
      setRemarksDirty(false);
    } catch { /* show error */ }
    finally { setRemarksSaving(false); }
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#F4EFE6] px-4 pt-6 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC] shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-[#2C2218]">End-of-Semester Exam</h1>
            <p className="text-xs text-[#8C7E6E] truncate">{subject} · {class_name}</p>
          </div>

          {/* Offline template buttons */}
          <button
            onClick={downloadExamTemplate}
            title="Download exam score template"
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC] shrink-0 text-[#8C7E6E] text-sm font-bold"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13M7 11l5 5 5-5M5 20h14" />
            </svg>
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            disabled={subLocked || uploading}
            title="Upload filled exam scores"
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC] shrink-0 text-[#8C7E6E] disabled:opacity-40"
          >
            {uploading ? <div className="w-3.5 h-3.5 rounded-full border-2 border-[#8C7E6E] border-t-transparent animate-spin" /> : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V3M7 8l5-5 5 5M5 20h14" />
              </svg>
            )}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleExamUpload}
          />
        </div>

        {/* Year + Semester selectors */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] px-4 py-3 flex gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Academic Year</p>
            <div className="relative">
              <select
                value={selectedYearId}
                onChange={e => setSelectedYearId(e.target.value)}
                className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-7 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
              >
                {years.length === 0
                  ? <option value={year_id}>{year_name}</option>
                  : years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)
                }
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="w-32 shrink-0">
            <p className="text-[10px] font-semibold text-[#8C7E6E] uppercase tracking-wide mb-1">Semester</p>
            <div className="relative">
              <select
                value={selectedSem}
                onChange={e => setSelectedSem(e.target.value)}
                className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-7 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
              >
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        {/* Max score input */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] px-4 py-3 flex items-center gap-3 mb-2">
          <p className="text-xs font-semibold text-[#8C7E6E] flex-1">Max Score</p>
          <input
            type="number"
            className="w-20 border border-[#E2D9CC] rounded-xl px-3 py-1.5 text-sm font-bold text-center text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
            value={maxScore}
            onChange={e => setMaxScore(e.target.value)}
            placeholder="100"
          />
        </div>

        {error && (
          <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">{error}</p>
        )}
        {saved && (
          <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-2">
            ✓ Exam scores saved for {selectedYearName} · Semester {selectedSem}.
          </p>
        )}
        {subLocked && (
          <div style={{ background: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: 10, padding: '10px 14px', marginBottom: 8, fontSize: 13, color: '#1E40AF', fontWeight: 500 }}>
            🔒 Scores are locked — submission status is <strong>{subStatus}</strong>. Contact your HOD or admin to unlock.
          </div>
        )}
      </div>

      {/* Student list */}
      <div className="px-4 space-y-2" style={subLocked ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
        {loading ? (
          <>
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-14 animate-pulse" />)}
          </>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-semibold text-[#8C7E6E]">No students found</p>
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.student_id}
              className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm flex items-center px-3 py-2.5 gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#2C2218] truncate">{row.name}</p>
                <p className="text-xs text-[#8C7E6E]">{row.student_code}</p>
              </div>
              <input
                ref={ref => { inputRefs.current[row.student_id] = ref; }}
                type="number"
                disabled={subLocked}
                className="w-20 border border-[#E2D9CC] rounded-xl px-2 py-1.5 text-sm font-bold text-center text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
                value={scores[row.student_id] ?? ''}
                onChange={e => setScores(prev => ({ ...prev, [row.student_id]: e.target.value }))}
                placeholder={`/${maxScore}`}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    const nextId = rows[index + 1]?.student_id;
                    if (nextId) inputRefs.current[nextId]?.focus();
                  }
                }}
              />
            </div>
          ))
        )}
      </div>

      {/* Save button */}
      {!loading && rows.length > 0 && (
        <div className="px-4 pt-4 pb-6 flex flex-col items-center gap-2">
          <button
            onClick={save}
            disabled={subLocked || saving}
            className="w-full max-w-sm px-6 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-60 transition-opacity shadow-sm"
            style={{ background: primary }}
          >
            {saving ? 'Saving…' : 'Save Exam Scores'}
          </button>
          <p className="text-xs text-[#8C7E6E]">{rows.length} student{rows.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* Upload result modal */}
      {uploadResult && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-4 pb-6">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#2C2218]">Upload Results</h2>
              <button
                onClick={() => setUploadResult(null)}
                className="w-8 h-8 rounded-full bg-[#F4EFE6] flex items-center justify-center"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="space-y-2 mb-3">
              <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <span className="text-green-700 font-bold text-sm">{uploadResult.saved} score{uploadResult.saved !== 1 ? 's' : ''} saved</span>
              </div>
              {uploadResult.skipped > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  <span className="text-gray-600 text-sm">{uploadResult.skipped} row{uploadResult.skipped !== 1 ? 's' : ''} skipped (empty)</span>
                </div>
              )}
            </div>
            {uploadResult.errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#B83232] mb-1">{uploadResult.errors.length} error{uploadResult.errors.length !== 1 ? 's' : ''}:</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {uploadResult.errors.map((e, i) => (
                    <div key={i} className="text-xs text-[#B83232] bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                      Row {e.row}: {e.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subject Remarks (Task 4) */}
      {!loading && rows.length > 0 && (
        <div style={{ marginTop: 24, border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginLeft: 16, marginRight: 16, marginBottom: 24 }}>
          <button
            onClick={() => setRemarksExpanded(v => !v)}
            style={{ width: '100%', padding: '12px 16px', background: '#F8FAFC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: '#0F172A' }}
          >
            <span>Subject Remarks (optional)</span>
            <span style={{ fontSize: 12, color: '#64748B' }}>{remarksExpanded ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {remarksExpanded && (
            <div style={{ padding: '0 0 16px' }}>
              <p style={{ fontSize: 12, color: '#64748B', padding: '8px 16px 12px' }}>
                Optional per-student feedback for this subject. Students will see these on their results.
              </p>
              {subjRemarks.map((r, idx) => (
                <div key={r.student_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', borderTop: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 13, color: '#374151', width: 180, flexShrink: 0 }}>{r.name}</span>
                  <input
                    disabled={subLocked}
                    value={r.remarks}
                    onChange={e => {
                      const next = [...subjRemarks];
                      next[idx] = { ...next[idx], remarks: e.target.value };
                      setSubjRemarks(next);
                      setRemarksDirty(true);
                    }}
                    placeholder="Enter remark…"
                    style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none', background: subLocked ? '#F8FAFC' : '#fff' }}
                  />
                </div>
              ))}
              {!subLocked && (
                <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={saveRemarks}
                    disabled={remarksSaving || !remarksDirty}
                    style={{ background: '#15803D', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (remarksSaving || !remarksDirty) ? 0.5 : 1 }}
                  >
                    {remarksSaving ? 'Saving…' : 'Save Remarks'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}><div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" /></div>}>
      <ExamContent />
    </Suspense>
  );
}
