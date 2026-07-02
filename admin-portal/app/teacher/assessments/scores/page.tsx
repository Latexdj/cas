'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface ScoreRow {
  student_id: string;
  student_code: string;
  name: string;
  score_id: string | null;
  score: number | null;
  absent: boolean;
}

interface AssessmentInfo {
  id: string;
  mode_name: string;
  title: string | null;
  date: string | null;
  max_score: number;
  class_name: string;
  subject: string;
  academic_year_id: string;
  semester: number;
}

function ScoresContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const assessment_id    = sp.get('assessment_id')    ?? '';
  const assessment_label = sp.get('assessment_label') ?? 'Assessment';

  const [primary, setPrimary] = useState('#2ab289');
  const [assessment, setAssessment] = useState<AssessmentInfo | null>(null);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [absents, setAbsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [subLocked, setSubLocked] = useState(false);
  const [subStatus, setSubStatus] = useState<string>('draft');

  const inputRefs    = useRef<Record<string, HTMLInputElement | null>>({});
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading]       = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    saved: number; skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  const load = useCallback(async () => {
    if (!assessment_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await teacherApi.get(`/api/assessments/${assessment_id}/scores`);
      setAssessment(data.assessment);
      setRows(data.scores ?? []);
      const s: Record<string, string> = {};
      const a: Record<string, boolean> = {};
      for (const r of (data.scores ?? []) as ScoreRow[]) {
        s[r.student_id] = r.score != null ? String(r.score) : '';
        a[r.student_id] = r.absent;
      }
      setScores(s);
      setAbsents(a);

      // Fetch submission lock status
      if (data.assessment) {
        const info = data.assessment as AssessmentInfo;
        try {
          const { data: statuses } = await teacherApi.get<Array<{ subject: string; class_name: string; status: string }>>(
            `/api/result-submissions/my-status?academic_year_id=${info.academic_year_id}&semester=${info.semester}`
          );
          const mine = statuses.find(s => s.subject === info.subject && s.class_name === info.class_name);
          const st = mine?.status ?? 'draft';
          setSubStatus(st);
          setSubLocked(['submitted', 'hod_approved', 'final_approved', 'published'].includes(st));
        } catch { /* non-fatal */ }
      }
    } catch {
      setError('Failed to load scores.');
    } finally {
      setLoading(false);
    }
  }, [assessment_id]);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    load();
  }, [load]);

  async function downloadTemplate() {
    try {
      const resp = await teacherApi.get(`/api/assessments/${assessment_id}/score-template`, {
        responseType: 'blob',
        timeout: 30000,
      });
      const url = URL.createObjectURL(resp.data as Blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `${assessment_label}_scores.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download template.');
    }
  }

  async function handleUploadScores(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setError('');
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await teacherApi.post<{
        saved: number; skipped: number; errors: { row: number; message: string }[];
      }>(`/api/assessments/${assessment_id}/upload-scores`, form, {
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
        score:  absents[r.student_id] ? null : (scores[r.student_id] !== '' ? parseFloat(scores[r.student_id]) : null),
        absent: absents[r.student_id] ?? false,
      }));
      await teacherApi.post(`/api/assessments/${assessment_id}/scores`, { scores: payload });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  const maxScore = assessment?.max_score ?? 100;

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
            <h1 className="text-base font-bold text-[#2C2218] truncate">{assessment_label}</h1>
            {assessment && (
              <p className="text-xs text-[#8C7E6E]">{assessment.subject} · {assessment.class_name} · Max: {maxScore}</p>
            )}
          </div>

          {/* Offline template buttons */}
          <button
            onClick={downloadTemplate}
            title="Download score template"
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC] shrink-0 text-[#8C7E6E] text-sm font-bold"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13M7 11l5 5 5-5M5 20h14" />
            </svg>
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            disabled={subLocked || uploading}
            title="Upload filled scores"
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
            onChange={handleUploadScores}
          />
        </div>

        {error && (
          <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">{error}</p>
        )}
        {saved && (
          <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-2">✓ Scores saved.</p>
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
          rows.map((row, index) => {
            const isAbsent = absents[row.student_id] ?? false;
            return (
              <div
                key={row.student_id}
                className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm flex items-center px-3 py-2.5 gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#2C2218] truncate">{row.name}</p>
                  <p className="text-xs text-[#8C7E6E]">{row.student_code}</p>
                </div>

                {isAbsent ? (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-500 border border-red-100">
                    Absent
                  </span>
                ) : (
                  <input
                    ref={ref => { inputRefs.current[row.student_id] = ref; }}
                    type="number"
                    disabled={subLocked}
                    className="w-16 border border-[#E2D9CC] rounded-xl px-2 py-1.5 text-sm font-bold text-center text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
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
                )}

                <button
                  onClick={() => setAbsents(prev => ({ ...prev, [row.student_id]: !prev[row.student_id] }))}
                  disabled={subLocked}
                  className="w-8 h-8 rounded-full flex items-center justify-center border transition-colors"
                  style={
                    isAbsent
                      ? { background: '#EF4444', borderColor: '#EF4444' }
                      : { background: '#F4EFE6', borderColor: '#E2D9CC' }
                  }
                  title="Toggle absent"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4" style={{ color: isAbsent ? '#fff' : '#C8BFB5' }}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Save button — inline, after the student list */}
      {!loading && rows.length > 0 && (
        <div className="px-4 pt-4 pb-6 flex flex-col items-center gap-2">
          <button
            onClick={save}
            disabled={subLocked || saving}
            className="w-full max-w-sm px-6 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-60 transition-opacity shadow-sm"
            style={{ background: primary }}
          >
            {saving ? 'Saving…' : 'Save All Scores'}
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
    </div>
  );
}

export default function ScoresPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}><div className="w-7 h-7 rounded-full border-2 border-[#2ab289] border-t-transparent animate-spin" /></div>}>
      <ScoresContent />
    </Suspense>
  );
}
