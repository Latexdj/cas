'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { principalApi } from '@/lib/principal-api';

interface GenderCount { boys: number; girls: number; total: number }
interface Subject {
  name: string; isCore: boolean;
  registered: GenderCount; presented: GenderCount; absent: GenderCount; cancelled: GenderCount;
  gradeDistribution: Record<string, { boys: number; girls: number }>;
  percentagePass: { boys: number; girls: number; total: number };
}
interface OfficialSummary {
  totalCandidates: number; buckets: Record<string, number>; failures?: number; absent?: number;
  entireResultsWithheld?: number; entireResultsPending?: number; candidateOwingFees?: number;
  entireResultsBlocked?: number; entireResultsCancelled?: number;
}
interface Report {
  year: number; examBody: string; totalCandidates: number; subjects: Subject[];
  summaryOfPasses: { buckets: Record<string, number>; failures: number; noResultCandidates: number };
  officialSummary: OfficialSummary | null;
  summaryMismatches: string[];
}
interface Batch { id: string; year: number; candidate_count: number; }

interface SearchResult { index_number: string; name: string; gender: string; year: number }
interface StudentResult {
  year: number; indexNumber: string; name: string; gender: string;
  grades: { subjectName: string; grade: string }[];
  bestSixAggregate: number | null; subjectsCounted: number;
}
interface RankCandidate {
  indexNumber: string; name: string; gender: string;
  grades: Record<string, string>; bestSixAggregate: number; subjectsCounted: number;
}
interface Rankings { year: number; gradePoints: Record<string, number>; subjects: string[]; candidates: RankCandidate[] }

interface AnalyticsRow {
  subject: string; year: number; isCore: boolean;
  presented: GenderCount; percentagePass: GenderCount; failRate: number;
  topGrade: string | null; gradeDistribution: Record<string, { boys: number; girls: number }>;
  performanceLabel: string;
}
interface Analytics {
  years: number[]; subjects: string[]; totalCandidates: number; overallPassRate: number;
  rows: AnalyticsRow[]; latestBySubject: AnalyticsRow[];
}

const WAEC_GRADE_ORDER = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];
const TREND_COLOR = '#1C8A62';

export default function PrincipalWaecResultsPage() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const dark = mounted && theme === 'dark';

  const cardBg     = dark ? '#1E293B' : '#FFFFFF';
  const border     = dark ? '#334155' : '#E2E8F0';
  const textStrong = dark ? '#F1F5F9' : '#1C1208';
  const textMuted  = dark ? '#64748B' : '#94A3B8';
  const gridColor  = dark ? '#334155' : '#E2D9CC';
  const green      = '#1C8A62';
  const gold       = dark ? '#B8842E' : '#C8973A';
  const red        = '#B83232';
  const selectStyle = { border: `1px solid ${border}`, background: cardBg, color: textStrong, borderRadius: 8, padding: '7px 12px', fontSize: 13 };
  const labelStyle  = { display: 'block' as const, fontSize: 11, fontWeight: 600, color: textMuted, marginBottom: 4 };
  const labelColor = (label: string) => (label === 'Needs Improvement' ? red : (label === 'Average' || label === 'Below Average') ? gold : green);

  function Card({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
    return (
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: textStrong }}>{title}</p>
            {subtitle && <p style={{ fontSize: 12, color: textMuted, marginTop: 2, marginBottom: 12 }}>{subtitle}</p>}
          </div>
          {right}
        </div>
        {children}
      </div>
    );
  }
  function StatTile({ label, value }: { label: string; value: string }) {
    return (
      <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: '14px 18px' }}>
        <p style={{ fontSize: 12, color: textMuted }}>{label}</p>
        <p style={{ fontSize: 24, fontWeight: 700, color: textStrong, marginTop: 4 }}>{value}</p>
      </div>
    );
  }
  function EmptyState({ message }: { message: string }) {
    return <p style={{ fontSize: 12, color: textMuted, textAlign: 'center', padding: '48px 0' }}>{message}</p>;
  }

  const [mode, setMode] = useState<'report' | 'analytics' | 'lookup' | 'rankings'>('report');

  // ── Batch list + single-year Report ──────────────────────────────────
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

  useEffect(() => {
    principalApi.get<Batch[]>('/api/principal/exam-results/batches')
      .then(r => { setBatches(r.data); if (r.data.length) setSelectedYear(r.data[0].year); })
      .catch(() => setBatches([]));
  }, []);

  const loadReport = useCallback(async () => {
    if (!batches || selectedYear === null) return;
    const batch = batches.find(b => b.year === selectedYear);
    if (!batch) return;
    setReportLoading(true);
    setReportError('');
    try {
      const { data } = await principalApi.get<Report>(`/api/principal/exam-results/batches/${batch.id}/report`);
      setReport(data);
    } catch {
      setReportError('Could not load this year’s report — check your connection and try again.');
    } finally {
      setReportLoading(false);
    }
  }, [batches, selectedYear]);
  useEffect(() => { loadReport(); }, [loadReport]);

  async function exportReport(format: 'xlsx' | 'pdf') {
    if (!batches || selectedYear === null) return;
    const batch = batches.find(b => b.year === selectedYear);
    if (!batch) return;
    setExporting(format);
    try {
      const token = localStorage.getItem('cas_p_token');
      const base = process.env.NEXT_PUBLIC_API_URL ?? '';
      const r = await fetch(`${base}/api/principal/exam-results/batches/${batch.id}/export.${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WAEC_${selectedYear}_Analysis_Report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setReportError(`${format.toUpperCase()} export failed. Please try again.`);
    } finally {
      setExporting(null);
    }
  }

  // ── Cross-year Analytics ──────────────────────────────────────────────
  const [full, setFull] = useState<Analytics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsSubject, setAnalyticsSubject] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);

  useEffect(() => {
    principalApi.get<Analytics>('/api/principal/exam-results/analytics').then(r => { setFull(r.data); setAnalytics(r.data); });
  }, []);

  const loadAnalytics = useCallback(async (subject: string) => {
    setAnalyticsLoading(true);
    try {
      const { data } = await principalApi.get<Analytics>('/api/principal/exam-results/analytics', {
        params: subject ? { subjects: subject } : {},
      });
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  async function exportCsv() {
    setCsvExporting(true);
    try {
      const token = localStorage.getItem('cas_p_token');
      const base = process.env.NEXT_PUBLIC_API_URL ?? '';
      const params = analyticsSubject ? `?subjects=${encodeURIComponent(analyticsSubject)}` : '';
      const r = await fetch(`${base}/api/principal/exam-results/analytics/export.csv${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'WAEC_Analytics.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setCsvExporting(false);
    }
  }

  // ── Student Lookup ─────────────────────────────────────────────────────
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<SearchResult[] | null>(null);
  const [lookupSearching, setLookupSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [student, setStudent] = useState<StudentResult | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const lookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current);
    if (lookupQuery.trim().length < 2) { setLookupResults(null); return; }
    lookupDebounceRef.current = setTimeout(async () => {
      setLookupSearching(true);
      try {
        const { data } = await principalApi.get<SearchResult[]>('/api/principal/exam-results/students/search', { params: { q: lookupQuery.trim() } });
        setLookupResults(data);
      } catch {
        setLookupResults([]);
      } finally {
        setLookupSearching(false);
      }
    }, 300);
    return () => { if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current); };
  }, [lookupQuery]);

  const openStudent = useCallback(async (result: SearchResult) => {
    setSelectedResult(result);
    setStudentLoading(true);
    try {
      const { data } = await principalApi.get<StudentResult>(`/api/principal/exam-results/students/${result.year}/${encodeURIComponent(result.index_number)}`);
      setStudent(data);
    } catch {
      setStudent(null);
    } finally {
      setStudentLoading(false);
    }
  }, []);

  // ── Rankings ────────────────────────────────────────────────────────────
  const [rankYear, setRankYear] = useState<number | null>(null);
  const [rankGender, setRankGender] = useState('');
  const [rankSubject, setRankSubject] = useState('');
  const [rankings, setRankings] = useState<Rankings | null>(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  useEffect(() => { if (batches && batches.length && rankYear === null) setRankYear(batches[0].year); }, [batches, rankYear]);

  const loadRankings = useCallback(async (y: number) => {
    setRankingsLoading(true);
    try {
      const { data } = await principalApi.get<Rankings>('/api/principal/exam-results/rankings', { params: { year: y } });
      setRankings(data);
    } catch {
      setRankings(null);
    } finally {
      setRankingsLoading(false);
    }
  }, []);
  useEffect(() => { if (mode === 'rankings' && rankYear !== null) loadRankings(rankYear); }, [mode, rankYear, loadRankings]);

  const rankRows = useMemo(() => {
    if (!rankings) return [] as RankCandidate[];
    let list = rankings.candidates.filter(c => !rankGender || c.gender === rankGender);
    if (rankSubject) {
      list = list
        .filter(c => rankings.gradePoints[c.grades[rankSubject]] != null)
        .sort((a, b) => rankings.gradePoints[a.grades[rankSubject]] - rankings.gradePoints[b.grades[rankSubject]] || a.bestSixAggregate - b.bestSixAggregate);
    } else {
      list = [...list].sort((a, b) => a.bestSixAggregate - b.bestSixAggregate);
    }
    return list;
  }, [rankings, rankGender, rankSubject]);

  const trend = useMemo(() => {
    if (!analytics) return [] as { year: number; pct: number }[];
    const years = [...new Set(analytics.rows.map(r => r.year))].sort((a, b) => a - b);
    if (analyticsSubject) {
      return years.map(year => ({ year, pct: analytics.rows.find(r => r.year === year && r.subject === analyticsSubject)?.percentagePass.total ?? 0 }));
    }
    return years.map(year => {
      const yearRows = analytics.rows.filter(r => r.year === year);
      const presented = yearRows.reduce((s, r) => s + r.presented.total, 0);
      const passed = yearRows.reduce((s, r) => s + Math.round((r.percentagePass.total / 100) * r.presented.total), 0);
      return { year, pct: presented > 0 ? Math.round((passed / presented) * 1000) / 10 : 0 };
    });
  }, [analytics, analyticsSubject]);

  const gradeDist = useMemo(() => {
    if (!analytics || !analyticsSubject) return null;
    const subjectRows = analytics.rows.filter(r => r.subject === analyticsSubject);
    return WAEC_GRADE_ORDER.map(grade => ({
      grade,
      count: subjectRows.reduce((s, r) => s + (r.gradeDistribution[grade] ? r.gradeDistribution[grade].boys + r.gradeDistribution[grade].girls : 0), 0),
    }));
  }, [analytics, analyticsSubject]);

  const coreSubjects = report?.subjects.filter(s => s.isCore) ?? [];
  const electiveSubjects = report?.subjects.filter(s => !s.isCore) ?? [];
  const maxBucket = report ? Math.max(0, ...Object.keys(report.summaryOfPasses.buckets).map(Number)) : 0;

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? green : border}`, background: active ? green : 'transparent', color: active ? '#fff' : textMuted,
  });

  if (batches === null) return <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: textStrong }}>WAEC Results</h2>
          <p style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>WASSCE Analysis Report and multi-year performance trends.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={tabBtn(mode === 'report')} onClick={() => setMode('report')}>Year Report</button>
          <button style={tabBtn(mode === 'analytics')} onClick={() => setMode('analytics')}>Analytics Trends</button>
          <button style={tabBtn(mode === 'lookup')} onClick={() => setMode('lookup')}>Student Lookup</button>
          <button style={tabBtn(mode === 'rankings')} onClick={() => setMode('rankings')}>Rankings</button>
        </div>
      </div>

      {batches.length === 0 ? (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: textMuted }}>No WASSCE results have been imported for this school yet.</p>
        </div>
      ) : mode === 'report' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={labelStyle}>Year</label>
              <select value={selectedYear ?? ''} onChange={e => setSelectedYear(Number(e.target.value))} style={selectStyle}>
                {batches.map(b => <option key={b.id} value={b.year}>{b.year} ({b.candidate_count} candidates)</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={tabBtn(false)} disabled={exporting !== null} onClick={() => exportReport('xlsx')}>
                {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
              </button>
              <button style={tabBtn(false)} disabled={exporting !== null} onClick={() => exportReport('pdf')}>
                {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
              </button>
            </div>
          </div>

          {reportError && <p style={{ fontSize: 13, color: red }}>{reportError}</p>}

          {reportLoading && !report ? (
            <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>Loading…</div>
          ) : !report ? (
            <EmptyState message="Select a year to view its report." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, opacity: reportLoading ? 0.4 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <StatTile label="Candidates" value={String(report.totalCandidates)} />
                <StatTile label="Failures" value={String(report.summaryOfPasses.failures)} />
                <StatTile label="No Result (Absent/Cancelled/Withheld)" value={String(report.summaryOfPasses.noResultCandidates)} />
              </div>

              {[{ title: 'Core Subjects', subjects: coreSubjects }, { title: 'Elective Subjects', subjects: electiveSubjects }].map(({ title, subjects }) => subjects.length > 0 && (
                <Card key={title} title={title}>
                  <div style={{ overflowX: 'auto', marginTop: 8 }}>
                    <table style={{ fontSize: 12, borderCollapse: 'collapse', minWidth: '100%' }}>
                      <thead>
                        <tr style={{ color: textMuted }}>
                          <th style={{ textAlign: 'left', padding: '4px 8px' }}>Subject</th>
                          <th style={{ padding: '4px 8px' }}>Presented</th>
                          {WAEC_GRADE_ORDER.map(g => <th key={g} style={{ padding: '4px 8px' }}>{g}</th>)}
                          <th style={{ padding: '4px 8px' }}>% Pass</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjects.map(s => (
                          <tr key={s.name} style={{ borderTop: `1px solid ${border}` }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600, color: textStrong, whiteSpace: 'nowrap' }}>{s.name}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', color: textMuted }}>{s.presented.total}</td>
                            {WAEC_GRADE_ORDER.map(g => {
                              const d = s.gradeDistribution[g];
                              return <td key={g} style={{ padding: '6px 8px', textAlign: 'center', color: textMuted }}>{d ? d.boys + d.girls : ''}</td>;
                            })}
                            <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: textStrong }}>{s.percentagePass.total}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: report.officialSummary ? '1fr 1fr' : '1fr', gap: 16 }}>
                <Card title="Summary of Subjects Passed (computed)">
                  <table style={{ fontSize: 13, marginTop: 8, width: '100%' }}>
                    <tbody>
                      <tr><td style={{ padding: '3px 0', color: textMuted }}>Total Candidates</td><td style={{ textAlign: 'right', fontWeight: 700, color: textStrong }}>{report.totalCandidates}</td></tr>
                      {Array.from({ length: maxBucket }, (_, i) => maxBucket - i).map(n => (
                        <tr key={n}><td style={{ padding: '3px 0', color: textMuted }}>{n} {n === 1 ? 'Pass' : 'Passes'}</td><td style={{ textAlign: 'right', fontWeight: 700, color: textStrong }}>{report.summaryOfPasses.buckets[n] || 0}</td></tr>
                      ))}
                      <tr><td style={{ padding: '3px 0', color: textMuted }}>Failures</td><td style={{ textAlign: 'right', fontWeight: 700, color: textStrong }}>{report.summaryOfPasses.failures}</td></tr>
                      <tr><td style={{ padding: '3px 0', color: textMuted }}>No Result (Absent/Cancelled/Withheld)</td><td style={{ textAlign: 'right', fontWeight: 700, color: textStrong }}>{report.summaryOfPasses.noResultCandidates}</td></tr>
                    </tbody>
                  </table>
                </Card>
                {report.officialSummary && (
                  <Card title="WAEC’s Own Printed Summary">
                    <table style={{ fontSize: 13, marginTop: 8, width: '100%' }}>
                      <tbody>
                        <tr><td style={{ padding: '3px 0', color: textMuted }}>Total Candidates</td><td style={{ textAlign: 'right', fontWeight: 700, color: textStrong }}>{report.officialSummary.totalCandidates}</td></tr>
                        <tr><td style={{ padding: '3px 0', color: textMuted }}>Failures</td><td style={{ textAlign: 'right', fontWeight: 700, color: textStrong }}>{report.officialSummary.failures ?? 0}</td></tr>
                        <tr><td style={{ padding: '3px 0', color: textMuted }}>Absent</td><td style={{ textAlign: 'right', fontWeight: 700, color: textStrong }}>{report.officialSummary.absent ?? 0}</td></tr>
                        <tr><td style={{ padding: '3px 0', color: textMuted }}>Entire Results Cancelled</td><td style={{ textAlign: 'right', fontWeight: 700, color: textStrong }}>{report.officialSummary.entireResultsCancelled ?? 0}</td></tr>
                      </tbody>
                    </table>
                  </Card>
                )}
              </div>

              {report.summaryMismatches.length > 0 && (
                <div style={{ background: dark ? '#3A2A0F' : '#FDF3E0', border: `1px solid ${gold}`, borderLeft: `3px solid ${gold}`, borderRadius: 8, padding: '10px 14px' }}>
                  {report.summaryMismatches.map((m, i) => <p key={i} style={{ fontSize: 12, color: textMuted, margin: 0 }}>{m}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      ) : mode === 'analytics' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <label style={labelStyle}>Subject</label>
              <select value={analyticsSubject} onChange={e => { setAnalyticsSubject(e.target.value); loadAnalytics(e.target.value); }} style={selectStyle}>
                <option value="">All Subjects</option>
                {full?.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button style={tabBtn(false)} disabled={csvExporting} onClick={exportCsv}>{csvExporting ? 'Exporting…' : 'Export CSV'}</button>
          </div>

          {!analytics ? (
            <div style={{ textAlign: 'center', padding: 60, color: textMuted }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, opacity: analyticsLoading ? 0.4 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <StatTile label="Total candidates" value={String(analytics.totalCandidates)} />
                <StatTile label="Overall pass rate" value={`${analytics.overallPassRate}%`} />
                <StatTile label="Subjects" value={String(analytics.subjects.length)} />
                <StatTile label="Years analyzed" value={String(analytics.years.length)} />
              </div>

              <Card title="Performance trend" subtitle={analyticsSubject ? `Pass rate by year — ${analyticsSubject}` : 'Overall pass rate by year, weighted by candidates'}>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={gridColor} />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: textMuted }} axisLine={{ stroke: gridColor }} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} formatter={(v) => [`${v}%`, 'Pass rate']} />
                    <Line type="monotone" dataKey="pct" name="Pass rate" stroke={TREND_COLOR} strokeWidth={2} dot={{ r: 4, fill: TREND_COLOR, strokeWidth: 2, stroke: cardBg }} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              {gradeDist && (
                <Card title={`Grade distribution — ${analyticsSubject}`} subtitle="Across every year on record">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={gradeDist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={gridColor} />
                      <XAxis dataKey="grade" tick={{ fontSize: 12, fill: textMuted }} axisLine={{ stroke: gridColor }} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: textMuted }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textStrong }} />
                      <Bar dataKey="count" name="Students" fill={green} radius={[4, 4, 0, 0]} maxBarSize={32}>
                        <LabelList dataKey="count" position="top" fontSize={11} fill={textMuted} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              <Card title="Subject performance by year">
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ fontSize: 12, borderCollapse: 'collapse', minWidth: '100%' }}>
                    <thead>
                      <tr style={{ color: textMuted }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Subject</th>
                        <th style={{ padding: '4px 8px' }}>Year</th>
                        <th style={{ padding: '4px 8px' }}>Candidates</th>
                        <th style={{ padding: '4px 8px' }}>Pass rate</th>
                        <th style={{ padding: '4px 8px' }}>Top grade</th>
                        <th style={{ padding: '4px 8px' }}>Performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...analytics.rows].sort((a, b) => a.subject.localeCompare(b.subject) || b.year - a.year).map(r => (
                        <tr key={`${r.subject}-${r.year}`} style={{ borderTop: `1px solid ${border}` }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: textStrong, whiteSpace: 'nowrap' }}>{r.subject}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: textMuted }}>{r.year}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: textMuted }}>{r.presented.total}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: textStrong }}>{r.percentagePass.total}%</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: textMuted }}>{r.topGrade ?? '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: labelColor(r.performanceLabel) }}>{r.performanceLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : mode === 'lookup' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <input
            value={lookupQuery}
            onChange={e => { setLookupQuery(e.target.value); setSelectedResult(null); setStudent(null); }}
            placeholder="Search by name or index number…"
            style={{ ...selectStyle, width: '100%', maxWidth: 420 }}
          />

          {lookupSearching && <p style={{ fontSize: 12, color: textMuted }}>Searching…</p>}

          {lookupResults && lookupResults.length === 0 && lookupQuery.trim().length >= 2 && !lookupSearching && (
            <p style={{ fontSize: 13, color: textMuted }}>No matching student found.</p>
          )}

          {lookupResults && lookupResults.length > 0 && !selectedResult && (
            <Card title="Search results">
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
                {lookupResults.map(r => (
                  <button key={`${r.index_number}-${r.year}`} onClick={() => openStudent(r)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', background: 'transparent', border: 'none', borderTop: `1px solid ${border}`, padding: '10px 2px', cursor: 'pointer' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: textStrong }}>{r.name}</p>
                      <p style={{ fontSize: 11, color: textMuted }}>{r.index_number} · {r.gender}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>{r.year}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {selectedResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <button onClick={() => { setSelectedResult(null); setStudent(null); }}
                style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: green, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                &larr; Back to results
              </button>
              {studentLoading ? (
                <EmptyState message="Loading…" />
              ) : student ? (
                <Card title={student.name} subtitle={`${student.indexNumber} · ${student.gender} · WASSCE ${student.year}`}
                  right={<div style={{ textAlign: 'right' }}><p style={{ fontSize: 22, fontWeight: 700, color: green }}>{student.bestSixAggregate ?? '—'}</p><p style={{ fontSize: 11, color: textMuted }}>Best {student.subjectsCounted} Aggregate</p></div>}>
                  <table style={{ fontSize: 13, marginTop: 8, width: '100%' }}>
                    <tbody>
                      {student.grades.map(g => (
                        <tr key={g.subjectName} style={{ borderTop: `1px solid ${border}` }}>
                          <td style={{ padding: '5px 0', color: textMuted }}>{g.subjectName}</td>
                          <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 700, color: textStrong }}>{g.grade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ) : (
                <EmptyState message="No results found." />
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={labelStyle}>Year</label>
              <select value={rankYear ?? ''} onChange={e => setRankYear(Number(e.target.value))} style={selectStyle}>
                {batches.map(b => <option key={b.id} value={b.year}>{b.year} ({b.candidate_count} candidates)</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Gender</label>
              <select value={rankGender} onChange={e => setRankGender(e.target.value)} style={selectStyle}>
                <option value="">All</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Subject</label>
              <select value={rankSubject} onChange={e => setRankSubject(e.target.value)} style={selectStyle}>
                <option value="">Best-6 aggregate (all subjects)</option>
                {rankings?.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {rankingsLoading ? (
            <EmptyState message="Loading…" />
          ) : rankRows.length === 0 ? (
            <EmptyState message="No candidates match this filter." />
          ) : (
            <Card title={`Rankings — ${rankYear}`}>
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table style={{ fontSize: 12, borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead>
                    <tr style={{ color: textMuted }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Index Number</th>
                      <th style={{ padding: '4px 8px' }}>Gender</th>
                      {rankSubject && <th style={{ padding: '4px 8px' }}>{rankSubject}</th>}
                      <th style={{ padding: '4px 8px' }}>Best-6 Aggregate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankRows.map((c, i) => (
                      <tr key={c.indexNumber} style={{ borderTop: `1px solid ${border}` }}>
                        <td style={{ padding: '6px 8px', color: textMuted }}>{i + 1}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: textStrong, whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '6px 8px', color: textMuted, fontFamily: 'monospace' }}>{c.indexNumber}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: textMuted }}>{c.gender}</td>
                        {rankSubject && <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: textStrong }}>{c.grades[rankSubject]}</td>}
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: green }}>
                          {c.bestSixAggregate}{c.subjectsCounted < 6 && <span style={{ color: textMuted, fontWeight: 400 }}> ({c.subjectsCounted} subj.)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
