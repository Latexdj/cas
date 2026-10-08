'use client';
import { Fragment, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface ParsedGrade { subjectRaw: string; subjectName: string; grade: string }
interface ParsedCandidate { indexNumber: string; name: string; gender: 'Male' | 'Female'; dob: string; grades: ParsedGrade[] }
interface ParseWarning { type: string; indexNumber?: string; message: string }
interface ParseResult {
  schoolName: string | null; schoolNumber: string | null; year: number | null;
  declaredTotal: number | null; candidates: ParsedCandidate[]; warnings: ParseWarning[];
  source: 'upload' | 'paste'; rawText: string;
}
interface RegEntry { registeredBoys: number; registeredGirls: number; absentBoys: number; absentGirls: number }

const WAEC_GRADE_ORDER = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];
interface GenderPair { boys: number; girls: number }
interface AggregateSubject {
  name: string; isCore: boolean;
  registered: GenderPair; presented: GenderPair; absent: GenderPair; cancelled: GenderPair;
  gradeDistribution: Record<string, GenderPair>;
}
interface AggregateSummary { buckets: Record<string, number>; failures: number; noResultCandidates: number }
interface ExcelSheet {
  sheetName: string; detectedYear: number | null; schoolName: string | null;
  totalCandidates: number; subjects: AggregateSubject[]; summaryOfPasses: AggregateSummary | null;
  warnings: { type: string; message: string }[];
}
function blankGradeDistribution(): Record<string, GenderPair> {
  const d: Record<string, GenderPair> = {};
  for (const g of WAEC_GRADE_ORDER) d[g] = { boys: 0, girls: 0 };
  return d;
}
function blankSubject(): AggregateSubject {
  return {
    name: '', isCore: false,
    registered: { boys: 0, girls: 0 }, presented: { boys: 0, girls: 0 },
    absent: { boys: 0, girls: 0 }, cancelled: { boys: 0, girls: 0 },
    gradeDistribution: blankGradeDistribution(),
  };
}
const numCellCls = 'w-12 rounded border border-slate-200 px-1 py-0.5 text-center text-xs';

const WAEC_CORE_SUBJECTS = ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies'];
interface LiveWarning { type: string; message: string }

function sumGradesByGender(dist: Record<string, GenderPair>, gender: 'boys' | 'girls') {
  return Object.values(dist).reduce((s, d) => s + (d[gender] || 0), 0);
}

// Mirrors backend/src/utils/examAggregateValidation.js's
// validateAggregateReportHard/Soft — deliberately duplicated (not shared
// across the Node/browser boundary) so the review table can re-check live
// as the admin edits, while the backend still enforces the hard blocks as
// the final gate at save time regardless of what the client computed.
function computeHardErrors(subjects: AggregateSubject[]): string[] {
  const errors: string[] = [];
  if (subjects.length === 0) { errors.push('At least one subject is required.'); return errors; }
  const seen = new Set<string>();
  for (const s of subjects) {
    const name = s.name.trim();
    if (!name) { errors.push('Every subject needs a name.'); continue; }
    const key = name.toLowerCase();
    if (seen.has(key)) errors.push(`"${name}" appears more than once.`);
    seen.add(key);
  }
  return errors;
}

function computeLiveWarnings(subjects: AggregateSubject[], totalCandidates: number, summary: AggregateSummary | null): LiveWarning[] {
  const warnings: LiveWarning[] = [];

  for (const s of subjects) {
    const name = s.name || '(unnamed)';
    const gradeSumB = sumGradesByGender(s.gradeDistribution, 'boys');
    const gradeSumG = sumGradesByGender(s.gradeDistribution, 'girls');
    const bOff = s.presented.boys !== gradeSumB + s.cancelled.boys;
    const gOff = s.presented.girls !== gradeSumG + s.cancelled.girls;
    if (bOff || gOff) {
      const parts: string[] = [];
      if (bOff) parts.push(`Boys: Presented ${s.presented.boys} vs grade counts + Cancelled ${gradeSumB + s.cancelled.boys}`);
      if (gOff) parts.push(`Girls: Presented ${s.presented.girls} vs grade counts + Cancelled ${gradeSumG + s.cancelled.girls}`);
      warnings.push({ type: 'presented_mismatch', message: `"${name}": ${parts.join('; ')}.` });
    }
    if (s.registered.boys !== s.presented.boys + s.absent.boys || s.registered.girls !== s.presented.girls + s.absent.girls) {
      warnings.push({ type: 'registered_mismatch', message: `"${name}": Registered (${s.registered.boys + s.registered.girls}) doesn't equal Presented + Absent (${s.presented.boys + s.absent.boys + s.presented.girls + s.absent.girls}).` });
    }
  }

  const coreSubjects = subjects.filter(s => WAEC_CORE_SUBJECTS.includes(s.name) || s.isCore);
  if (coreSubjects.length === 0) {
    warnings.push({ type: 'no_core_subjects', message: 'None of the four WASSCE core subjects (English Language, Mathematics, Integrated Science, Social Studies) are present.' });
  } else {
    const totals = coreSubjects.map(s => s.presented.boys + s.presented.girls);
    const maxP = Math.max(...totals), minP = Math.min(...totals);
    if (maxP !== minP) warnings.push({ type: 'core_subject_mismatch', message: `The core subjects don't all have the same Presented total (ranges from ${minP} to ${maxP}) — every candidate sits all four.` });
    if (totalCandidates !== maxP) warnings.push({ type: 'total_mismatch', message: `Total Candidates (${totalCandidates}) doesn't match the core subjects' own Presented total (${maxP}).` });
  }

  if (summary) {
    const bucketSum = Object.values(summary.buckets).reduce((a, b) => a + b, 0);
    const summarySum = bucketSum + summary.failures + summary.noResultCandidates;
    if (summarySum !== totalCandidates) warnings.push({ type: 'summary_mismatch', message: `Summary of Subjects Passed totals ${summarySum} candidates, but Total Candidates is ${totalCandidates}.` });
  }

  return warnings;
}

const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';
const WARNING_LABELS: Record<string, string> = {
  unrecognized_subject: 'Unrecognized subject',
  malformed_grade: 'Malformed grade',
  duplicate_subject: 'Duplicate subject',
  duplicate_candidate: 'Duplicate candidate',
  parse_failure: 'Parse failure',
  count_mismatch: 'Candidate count mismatch',
};

function presentedBySubject(candidates: ParsedCandidate[]) {
  const map = new Map<string, { boys: number; girls: number }>();
  for (const c of candidates) {
    for (const g of c.grades) {
      if (g.grade === 'X') continue;
      if (!map.has(g.subjectName)) map.set(g.subjectName, { boys: 0, girls: 0 });
      const entry = map.get(g.subjectName)!;
      if (c.gender === 'Male') entry.boys++; else entry.girls++;
    }
  }
  return map;
}

interface ExcelReviewProps {
  year: number; setYear: (y: number) => void;
  subjects: AggregateSubject[]; total: number; setTotal: (n: number) => void;
  summary: AggregateSummary | null;
  structuralWarnings: LiveWarning[]; liveWarnings: LiveWarning[]; hardErrors: string[];
  onUpdateSubject: <K extends keyof AggregateSubject>(idx: number, field: K, value: AggregateSubject[K]) => void;
  onUpdateGender: (idx: number, field: 'registered' | 'presented' | 'absent' | 'cancelled', gender: 'boys' | 'girls', raw: string) => void;
  onUpdateGrade: (idx: number, grade: string, gender: 'boys' | 'girls', raw: string) => void;
  onAddSubject: () => void; onRemoveSubject: (idx: number) => void;
  onUpdateSummaryField: (field: 'failures' | 'noResultCandidates', raw: string) => void;
  onUpdateBucket: (n: number, raw: string) => void;
  saveError: string; saving: boolean;
  onStartOver: () => void; onSave: () => void;
}

// Review/correction screen for an Excel Analysis Report import — every
// extracted field is editable before saving, same spirit as the
// PDF/paste path's Registered/Absent table, just covering every column
// since there's no candidate-level data underneath this to re-derive
// Presented/grade counts from if a cell is wrong. Validation warnings
// (hard blocks + soft consistency checks) re-run live via
// computeHardErrors/computeLiveWarnings as the admin edits, mirroring
// backend/src/utils/examAggregateValidation.js so the final server-side
// save-time check rarely surprises anyone.
function ExcelReview({
  year, setYear, subjects, total, setTotal, summary,
  structuralWarnings, liveWarnings, hardErrors,
  onUpdateSubject, onUpdateGender, onUpdateGrade, onAddSubject, onRemoveSubject,
  onUpdateSummaryField, onUpdateBucket, saveError, saving, onStartOver, onSave,
}: ExcelReviewProps) {
  const maxBucket = Math.max(8, ...Object.keys(summary?.buckets ?? {}).map(Number));
  // Subject names mentioned in a live warning get a visual flag on their
  // row — otherwise the admin has to cross-reference warning text against
  // a 28-column table by eye.
  const flaggedSubjects = new Set(
    subjects.filter(s => liveWarnings.some(w => w.message.includes(`"${s.name}"`))).map(s => s.name)
  );
  const allWarnings = [...structuralWarnings, ...liveWarnings];
  return (
    <>
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-slate-500">Year</label>
            <input type="number" className={`${inputCls} w-32`} value={year} onChange={e => setYear(parseInt(e.target.value, 10) || year)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">Total Candidates</label>
            <input type="number" min={0} className={`${inputCls} w-32`} value={total} onChange={e => setTotal(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </div>
        </div>
        <p className="text-xs text-slate-400">Extracted from an Excel Analysis Report — review every number below before saving. There are no individual candidate records for a year imported this way.</p>
      </section>

      {hardErrors.length > 0 && (
        <section className="bg-red-50 rounded-xl border border-red-200 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-red-800">Fix before saving</h2>
          <ul className="text-sm text-red-800 space-y-1">
            {hardErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </section>
      )}

      {allWarnings.length > 0 && (
        <section className="bg-amber-50 rounded-xl border border-amber-200 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-amber-800">{allWarnings.length} warning{allWarnings.length === 1 ? '' : 's'}</h2>
          <ul className="text-sm text-amber-800 space-y-1 max-h-48 overflow-y-auto">
            {allWarnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">Subjects</h2>
          <button onClick={onAddSubject} className="text-xs font-semibold text-[#145C44] hover:underline">+ Add subject</button>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left py-1.5 pr-2 sticky left-0 bg-white">Subject</th>
                <th className="py-1.5 px-1">Core</th>
                <th className="py-1.5 px-1" colSpan={2}>Registered</th>
                <th className="py-1.5 px-1" colSpan={2}>Presented</th>
                <th className="py-1.5 px-1" colSpan={2}>Absent</th>
                <th className="py-1.5 px-1" colSpan={2}>Cancelled</th>
                {WAEC_GRADE_ORDER.map(g => <th key={g} className="py-1.5 px-1" colSpan={2}>{g}</th>)}
                <th className="py-1.5 px-1" />
              </tr>
              <tr className="text-slate-400">
                <th className="sticky left-0 bg-white" />
                <th />
                {Array.from({ length: 4 + WAEC_GRADE_ORDER.length }).flatMap((_, i) => [
                  <th key={`${i}-b`} className="px-1 font-normal">B</th>,
                  <th key={`${i}-g`} className="px-1 font-normal">G</th>,
                ])}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((s, idx) => (
                <tr key={idx} className={flaggedSubjects.has(s.name) ? 'bg-amber-50/60' : undefined}>
                  <td className="py-1.5 pr-2 sticky left-0 bg-white" title={flaggedSubjects.has(s.name) ? 'This subject has a warning — see above' : undefined}>
                    <input className={`w-40 rounded border px-1.5 py-0.5 text-xs ${flaggedSubjects.has(s.name) ? 'border-amber-300' : 'border-slate-200'}`} value={s.name} onChange={e => onUpdateSubject(idx, 'name', e.target.value)} />
                  </td>
                  <td className="text-center px-1">
                    <input type="checkbox" checked={s.isCore} onChange={e => onUpdateSubject(idx, 'isCore', e.target.checked)} className="accent-[#145C44]" />
                  </td>
                  {(['registered', 'presented', 'absent', 'cancelled'] as const).map(field => (
                    <Fragment key={field}>
                      <td className="px-1"><input type="number" min={0} className={numCellCls} value={s[field].boys} onChange={e => onUpdateGender(idx, field, 'boys', e.target.value)} /></td>
                      <td className="px-1"><input type="number" min={0} className={numCellCls} value={s[field].girls} onChange={e => onUpdateGender(idx, field, 'girls', e.target.value)} /></td>
                    </Fragment>
                  ))}
                  {WAEC_GRADE_ORDER.map(g => (
                    <Fragment key={g}>
                      <td className="px-1"><input type="number" min={0} className={numCellCls} value={s.gradeDistribution[g]?.boys ?? 0} onChange={e => onUpdateGrade(idx, g, 'boys', e.target.value)} /></td>
                      <td className="px-1"><input type="number" min={0} className={numCellCls} value={s.gradeDistribution[g]?.girls ?? 0} onChange={e => onUpdateGrade(idx, g, 'girls', e.target.value)} /></td>
                    </Fragment>
                  ))}
                  <td className="px-1"><button onClick={() => onRemoveSubject(idx)} className="text-slate-300 hover:text-red-500 px-1" title="Remove subject">&times;</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-500">Summary of Subjects Passed</h2>
          <p className="text-xs text-slate-400 mt-0.5">Only present if this Excel report had its own copy of this block — leave as 0 if not applicable.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: maxBucket }, (_, i) => maxBucket - i).map(n => (
            <div key={n}>
              <label className="block text-[11px] text-slate-400">{n} Pass{n === 1 ? '' : 'es'}</label>
              <input type="number" min={0} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" value={summary?.buckets[n] ?? 0} onChange={e => onUpdateBucket(n, e.target.value)} />
            </div>
          ))}
          <div>
            <label className="block text-[11px] text-slate-400">Failures</label>
            <input type="number" min={0} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" value={summary?.failures ?? 0} onChange={e => onUpdateSummaryField('failures', e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400">No Result (Absent/Cancelled/Withheld)</label>
            <input type="number" min={0} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" value={summary?.noResultCandidates ?? 0} onChange={e => onUpdateSummaryField('noResultCandidates', e.target.value)} />
          </div>
        </div>
      </section>

      {saveError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{saveError}</p>}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onStartOver}>Start over</Button>
        <Button onClick={onSave} loading={saving} disabled={!subjects.length || hardErrors.length > 0}>Confirm &amp; Save</Button>
      </div>
    </>
  );
}

export default function WaecImportPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'upload' | 'paste' | 'excel'>('upload');
  const [year, setYear] = useState(new Date().getFullYear());
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [registeredData, setRegisteredData] = useState<Record<string, RegEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);

  // Excel Analysis Report import (no listing available for that year) —
  // separate state from the PDF/paste path above since the review shape
  // is entirely different (per-subject aggregate counts, no candidates).
  const [excelSheets, setExcelSheets] = useState<ExcelSheet[] | null>(null);
  const [excelSheetIdx, setExcelSheetIdx] = useState<number | null>(null);
  // Structural warnings from the original file (unrecognized subject,
  // count mismatch, etc.) — these came from the server's one-time parse
  // and can't meaningfully be recomputed as the admin edits numbers.
  const [excelStructuralWarnings, setExcelStructuralWarnings] = useState<LiveWarning[]>([]);
  const [excelSubjects, setExcelSubjects] = useState<AggregateSubject[]>([]);
  const [excelTotal, setExcelTotal] = useState(0);
  const [excelSummary, setExcelSummary] = useState<AggregateSummary | null>(null);

  // Consistency warnings (Presented vs grade counts, etc.) re-derived live
  // on every edit, and the hard blocks gating Confirm & Save — mirrors
  // backend/src/utils/examAggregateValidation.js so what the admin sees
  // here matches what the server will actually enforce at save time.
  const excelLiveWarnings = useMemo(() => computeLiveWarnings(excelSubjects, excelTotal, excelSummary), [excelSubjects, excelTotal, excelSummary]);
  const excelHardErrors = useMemo(() => computeHardErrors(excelSubjects), [excelSubjects]);
  const SOFT_WARNING_TYPES = new Set(['presented_mismatch', 'registered_mismatch', 'core_subject_mismatch', 'total_mismatch', 'no_core_subjects', 'summary_mismatch']);

  const subjectPresented = useMemo(() => (result ? presentedBySubject(result.candidates) : new Map()), [result]);

  async function doParse() {
    setParsing(true); setParseError('');
    try {
      let data: ParseResult;
      if (mode === 'upload') {
        const file = fileRef.current?.files?.[0];
        if (!file) { setParseError('Choose a PDF file.'); setParsing(false); return; }
        const fd = new FormData();
        fd.append('pdf', file);
        ({ data } = await api.post('/api/admin/exam-results/parse', fd));
      } else {
        if (!pasteText.trim()) { setParseError('Paste the listing text first.'); setParsing(false); return; }
        ({ data } = await api.post('/api/admin/exam-results/parse', { raw_text: pasteText }));
      }
      setResult(data);
      if (data.year) setYear(data.year);
      const defaults: Record<string, RegEntry> = {};
      for (const [subject, { boys, girls }] of presentedBySubject(data.candidates)) {
        defaults[subject] = { registeredBoys: boys, registeredGirls: girls, absentBoys: 0, absentGirls: 0 };
      }
      setRegisteredData(defaults);
    } catch (e: unknown) {
      setParseError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not parse this listing.');
    } finally { setParsing(false); }
  }

  async function doParseExcel() {
    setParsing(true); setParseError('');
    try {
      const file = excelFileRef.current?.files?.[0];
      if (!file) { setParseError('Choose an Excel (.xlsx) file.'); setParsing(false); return; }
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{ sheets: ExcelSheet[] }>('/api/admin/exam-results/parse-excel', fd);
      setExcelSheets(data.sheets);
      if (data.sheets.length === 1) selectExcelSheet(data.sheets, 0);
    } catch (e: unknown) {
      setParseError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not read this workbook.');
    } finally { setParsing(false); }
  }

  function selectExcelSheet(sheets: ExcelSheet[], idx: number) {
    const sheet = sheets[idx];
    setExcelSheetIdx(idx);
    // The server's response includes both structural warnings AND the
    // same soft consistency checks computed live below — keep only the
    // structural ones here so a check isn't shown twice (once stale from
    // parse time, once live) as the admin starts editing.
    setExcelStructuralWarnings(sheet.warnings.filter(w => !SOFT_WARNING_TYPES.has(w.type)));
    setExcelSubjects(sheet.subjects.map(s => ({ ...s, gradeDistribution: { ...blankGradeDistribution(), ...s.gradeDistribution } })));
    setExcelTotal(sheet.totalCandidates);
    setExcelSummary(sheet.summaryOfPasses);
    if (sheet.detectedYear) setYear(sheet.detectedYear);
  }

  function updateExcelSubject<K extends keyof AggregateSubject>(idx: number, field: K, value: AggregateSubject[K]) {
    setExcelSubjects(prev => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }
  function updateExcelGender(idx: number, field: 'registered' | 'presented' | 'absent' | 'cancelled', gender: 'boys' | 'girls', raw: string) {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    setExcelSubjects(prev => prev.map((s, i) => (i === idx ? { ...s, [field]: { ...s[field], [gender]: n } } : s)));
  }
  function updateExcelGrade(idx: number, grade: string, gender: 'boys' | 'girls', raw: string) {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    setExcelSubjects(prev => prev.map((s, i) => (i === idx ? { ...s, gradeDistribution: { ...s.gradeDistribution, [grade]: { ...s.gradeDistribution[grade], [gender]: n } } } : s)));
  }
  function addExcelSubject() { setExcelSubjects(prev => [...prev, blankSubject()]); }
  function removeExcelSubject(idx: number) { setExcelSubjects(prev => prev.filter((_, i) => i !== idx)); }
  function updateExcelSummaryField(field: 'failures' | 'noResultCandidates', raw: string) {
    const n = Math.max(0, parseInt(raw, 10) || 0);
    setExcelSummary(prev => ({ buckets: prev?.buckets ?? {}, failures: prev?.failures ?? 0, noResultCandidates: prev?.noResultCandidates ?? 0, [field]: n }));
  }
  function updateExcelBucket(n: number, raw: string) {
    const count = Math.max(0, parseInt(raw, 10) || 0);
    setExcelSummary(prev => ({ buckets: { ...(prev?.buckets ?? {}), [n]: count }, failures: prev?.failures ?? 0, noResultCandidates: prev?.noResultCandidates ?? 0 }));
  }

  function startOverExcel() {
    setExcelSheets(null); setExcelSheetIdx(null); setExcelSubjects([]); setExcelStructuralWarnings([]);
    if (excelFileRef.current) excelFileRef.current.value = '';
  }

  async function confirmSaveExcel() {
    setSaving(true); setSaveError('');
    try {
      const { data } = await api.post('/api/admin/exam-results/batches', {
        exam_body: 'WAEC', year, source: 'excel',
        aggregate_report: { totalCandidates: excelTotal, subjects: excelSubjects, summaryOfPasses: excelSummary },
      });
      router.push(`/waec-results/${data.id}`);
    } catch (e: unknown) {
      setSaveError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  function updateReg(subject: string, field: keyof RegEntry, value: string) {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setRegisteredData(prev => ({ ...prev, [subject]: { ...prev[subject], [field]: n } }));
  }

  async function confirmSave() {
    if (!result) return;
    setSaving(true); setSaveError('');
    try {
      const { data } = await api.post('/api/admin/exam-results/batches', {
        exam_body: 'WAEC', year, source: result.source, raw_text: result.rawText,
        school_number: result.schoolNumber, registered_data: registeredData,
      });
      router.push(`/waec-results/${data.id}`);
    } catch (e: unknown) {
      setSaveError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/waec-results" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; WAEC Results</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Import WAEC Results</h1>
      </div>

      {mode === 'excel' && excelSheetIdx !== null ? (
        <ExcelReview
          year={year} setYear={setYear}
          subjects={excelSubjects} total={excelTotal} setTotal={setExcelTotal}
          summary={excelSummary}
          structuralWarnings={excelStructuralWarnings} liveWarnings={excelLiveWarnings} hardErrors={excelHardErrors}
          onUpdateSubject={updateExcelSubject} onUpdateGender={updateExcelGender} onUpdateGrade={updateExcelGrade}
          onAddSubject={addExcelSubject} onRemoveSubject={removeExcelSubject}
          onUpdateSummaryField={updateExcelSummaryField} onUpdateBucket={updateExcelBucket}
          saveError={saveError} saving={saving}
          onStartOver={startOverExcel} onSave={confirmSaveExcel}
        />
      ) : mode === 'excel' && excelSheets !== null ? (
        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-500">This workbook has {excelSheets.length} sheets with analysis data — choose which one to import</h2>
          <div className="divide-y divide-slate-100">
            {excelSheets.map((sheet, i) => (
              <button
                key={i} onClick={() => selectExcelSheet(excelSheets, i)}
                className="w-full text-left py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{sheet.sheetName}</p>
                  <p className="text-xs text-slate-400">{sheet.detectedYear ?? 'Year not detected'} &middot; {sheet.subjects.length} subjects &middot; {sheet.totalCandidates} candidates</p>
                </div>
                <span className="text-xs font-semibold text-[#145C44]">Select</span>
              </button>
            ))}
          </div>
        </section>
      ) : !result ? (
        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500">Year</label>
            <input type="number" className={`${inputCls} w-32`} value={year} onChange={e => setYear(parseInt(e.target.value, 10) || year)} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('upload')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${mode === 'upload' ? 'bg-[#145C44] text-white border-[#145C44]' : 'text-slate-600 border-slate-200'}`}>Upload PDF</button>
            <button type="button" onClick={() => setMode('paste')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${mode === 'paste' ? 'bg-[#145C44] text-white border-[#145C44]' : 'text-slate-600 border-slate-200'}`}>Paste text</button>
            <button type="button" onClick={() => setMode('excel')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${mode === 'excel' ? 'bg-[#145C44] text-white border-[#145C44]' : 'text-slate-600 border-slate-200'}`}>Upload Excel report</button>
          </div>
          {mode === 'upload' ? (
            <input ref={fileRef} type="file" accept="application/pdf" className="text-sm" />
          ) : mode === 'paste' ? (
            <textarea
              className={`${inputCls} font-mono text-xs`} rows={10}
              placeholder="Select all (Ctrl+A) and copy the results listing, then paste it here…"
              value={pasteText} onChange={e => setPasteText(e.target.value)}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">For a year with no results listing available — upload the school&apos;s own old Excel Analysis Report instead. You&apos;ll review and can correct every extracted number before saving.</p>
              <input ref={excelFileRef} type="file" accept=".xlsx" className="text-sm" />
            </div>
          )}
          {parseError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{parseError}</p>}
          <Button onClick={mode === 'excel' ? doParseExcel : doParse} loading={parsing}>Parse</Button>
        </section>
      ) : (
        <>
          <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-2">
            <h2 className="text-sm font-semibold text-slate-500">Detected</h2>
            <p className="text-sm text-slate-700">{result.schoolName || 'School name not detected'} &middot; School # {result.schoolNumber || '—'} &middot; {result.candidates.length} candidates</p>
            {result.declaredTotal !== null && result.declaredTotal !== result.candidates.length && (
              <p className="text-sm text-amber-700">The listing declares {result.declaredTotal} candidates but {result.candidates.length} were parsed — check the warnings below before saving.</p>
            )}
          </section>

          {result.warnings.length > 0 && (
            <section className="bg-amber-50 rounded-xl border border-amber-200 p-5 space-y-2">
              <h2 className="text-sm font-semibold text-amber-800">{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}</h2>
              <ul className="text-sm text-amber-800 space-y-1 max-h-48 overflow-y-auto">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    <span className="font-semibold">{WARNING_LABELS[w.type] || w.type}</span>
                    {w.indexNumber ? ` (${w.indexNumber})` : ''}: {w.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-500">Registered / Absent</h2>
              <p className="text-xs text-slate-400 mt-0.5">The listing only includes candidates who have results, so these aren&apos;t detected automatically — review and correct them per subject before saving.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left py-1.5 pr-3">Subject</th>
                    <th className="text-center py-1.5 px-2">Presented (B)</th>
                    <th className="text-center py-1.5 px-2">Presented (G)</th>
                    <th className="text-center py-1.5 px-2">Registered (B)</th>
                    <th className="text-center py-1.5 px-2">Registered (G)</th>
                    <th className="text-center py-1.5 px-2">Absent (B)</th>
                    <th className="text-center py-1.5 px-2">Absent (G)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...subjectPresented.entries()].map(([subject, presented]) => {
                    const reg = registeredData[subject] ?? { registeredBoys: 0, registeredGirls: 0, absentBoys: 0, absentGirls: 0 };
                    return (
                      <tr key={subject}>
                        <td className="py-1.5 pr-3 font-medium text-slate-700">{subject}</td>
                        <td className="text-center py-1.5 px-2 text-slate-400">{presented.boys}</td>
                        <td className="text-center py-1.5 px-2 text-slate-400">{presented.girls}</td>
                        <td className="text-center py-1.5 px-2">
                          <input type="number" min={0} className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center" value={reg.registeredBoys} onChange={e => updateReg(subject, 'registeredBoys', e.target.value)} />
                        </td>
                        <td className="text-center py-1.5 px-2">
                          <input type="number" min={0} className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center" value={reg.registeredGirls} onChange={e => updateReg(subject, 'registeredGirls', e.target.value)} />
                        </td>
                        <td className="text-center py-1.5 px-2">
                          <input type="number" min={0} className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center" value={reg.absentBoys} onChange={e => updateReg(subject, 'absentBoys', e.target.value)} />
                        </td>
                        <td className="text-center py-1.5 px-2">
                          <input type="number" min={0} className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center" value={reg.absentGirls} onChange={e => updateReg(subject, 'absentGirls', e.target.value)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {saveError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{saveError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setResult(null)}>Start over</Button>
            <Button onClick={confirmSave} loading={saving}>Confirm &amp; Save</Button>
          </div>
        </>
      )}
    </div>
  );
}
