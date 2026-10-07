'use client';
import { useMemo, useRef, useState } from 'react';
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

export default function WaecImportPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [year, setYear] = useState(new Date().getFullYear());
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [registeredData, setRegisteredData] = useState<Record<string, RegEntry>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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

      {!result ? (
        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500">Year</label>
            <input type="number" className={`${inputCls} w-32`} value={year} onChange={e => setYear(parseInt(e.target.value, 10) || year)} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('upload')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${mode === 'upload' ? 'bg-[#145C44] text-white border-[#145C44]' : 'text-slate-600 border-slate-200'}`}>Upload PDF</button>
            <button type="button" onClick={() => setMode('paste')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${mode === 'paste' ? 'bg-[#145C44] text-white border-[#145C44]' : 'text-slate-600 border-slate-200'}`}>Paste text</button>
          </div>
          {mode === 'upload' ? (
            <input ref={fileRef} type="file" accept="application/pdf" className="text-sm" />
          ) : (
            <textarea
              className={`${inputCls} font-mono text-xs`} rows={10}
              placeholder="Select all (Ctrl+A) and copy the results listing, then paste it here…"
              value={pasteText} onChange={e => setPasteText(e.target.value)}
            />
          )}
          {parseError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{parseError}</p>}
          <Button onClick={doParse} loading={parsing}>Parse</Button>
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
