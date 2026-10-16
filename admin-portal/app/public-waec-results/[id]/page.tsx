'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { isNetworkError, withRetry } from '@/lib/retry';

interface SubjectSummary {
  name: string;
  isCore: boolean;
  percentagePass: { boys: number; girls: number; total: number };
  gradeDistribution: Record<string, { boys: number; girls: number }>;
  registered: { boys: number; girls: number; total: number };
  presented: { boys: number; girls: number; total: number };
  absent: { boys: number; girls: number; total: number };
  cancelled: { boys: number; girls: number; total: number };
}

interface ParseWarning {
  type: string;
  message: string;
  indexNumber?: string;
}

interface PublicReport {
  year: number;
  schoolName: string;
  schoolNumber: string | null;
  examBody: string;
  totalCandidates: number;
  subjects: SubjectSummary[];
  summaryOfPasses: { buckets: Record<string, number>; failures: number; noResultCandidates: number };
  officialSummary: Record<string, any> | null;
  warnings: ParseWarning[];
  summaryMismatches: string[];
}

// The parser emits one warning per affected candidate (e.g. "DAGAARE is not
// a recognized subject" shows up once per candidate who took it), which for
// a real school can mean hundreds of near-duplicate lines. Collapsing to
// one line per distinct message, with an affected-candidate count, is both
// the useful summary a reader actually wants and what keeps this block from
// rendering a thousand near-identical <p> tags.
function summarizeWarnings(warnings: ParseWarning[]): { message: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const w of warnings) counts.set(w.message, (counts.get(w.message) ?? 0) + 1);
  return Array.from(counts.entries()).map(([message, count]) => ({ message, count }));
}

const C = {
  forest: '#0B3D2E', mid: '#145C44', mid2: '#4A3F32',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
  success: '#2D7A4F', successBg: '#E8F4EE',
  warning: '#C8780A', warningBg: '#FDF3E3',
};

const SALES_EMAIL = process.env.NEXT_PUBLIC_CAS_SALES_EMAIL || 'hello@casattendance.com';

export default function PublicWaecReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<PublicReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await withRetry(() => publicApi.get(`/api/public/waec-results/${id}/report`));
      setReport(data.report ?? null);
      setError('');
    } catch (err: any) {
      setError(
        isNetworkError(err)
          ? 'Could not reach the server. Please check your connection and try again.'
          : err?.response?.data?.error || 'This WAEC report could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading) {
    return (
      <Centered>
        <div
          className="w-8 h-8 rounded-full border-2 border-b-transparent animate-spin"
          style={{ borderColor: C.mid, borderBottomColor: 'transparent', margin: '0 auto' }}
        />
        <p style={{ marginTop: 16, fontSize: 13, color: C.muted }}>Loading your WAEC analysis report.</p>
      </Centered>
    );
  }

  if (error || !report) {
    return (
      <Centered>
        <p style={{ fontSize: 17, fontWeight: 700, color: C.dark, margin: 0 }}>Report unavailable</p>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          {error || 'No analysis report was found for this payment.'}
        </p>
        <a href="/public-waec-results" style={{ display: 'inline-block', marginTop: 16, fontSize: 13, fontWeight: 600, color: C.mid }}>
          Start another WAEC analysis
        </a>
      </Centered>
    );
  }

  const overallPass = report.subjects.length
    ? Math.round((report.subjects.reduce((total, subject) => total + subject.percentagePass.total, 0) / report.subjects.length) * 10) / 10
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px 24px 56px' }}>
        <a href="/public-waec-results" style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>
          Back to WAEC checkout
        </a>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.forest, margin: 0 }}>
              {report.schoolName || 'WAEC'} {report.year} analysis
            </h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
              {report.examBody} · {report.totalCandidates} candidates
            </p>
          </div>
          <div style={{ background: C.successBg, border: '1px solid #C8E3D3', borderRadius: 8, padding: '10px 16px', textAlign: 'right' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.success, margin: 0 }}>Average pass rate</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: C.forest, margin: '2px 0 0' }}>{overallPass}%</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 24 }}>
          <StatCard label="Candidates" value={String(report.totalCandidates)} />
          <StatCard label="Failures" value={String(report.summaryOfPasses.failures || 0)} tone="warning" />
          <StatCard label="No result" value={String(report.summaryOfPasses.noResultCandidates || 0)} />
          <StatCard label="School no." value={report.schoolNumber || '—'} tone="success" />
        </div>

        {report.warnings?.length > 0 && (
          <div style={{ marginTop: 20, padding: 14, borderRadius: 8, background: C.warningBg, border: '1px solid #EBD3A0' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#8A5A08', margin: '0 0 6px' }}>
              {report.warnings.length} note{report.warnings.length === 1 ? '' : 's'} from reading this listing
            </p>
            {summarizeWarnings(report.warnings).map((w, idx) => (
              <p key={idx} style={{ fontSize: 13, color: '#8A5A08', margin: idx > 0 ? '6px 0 0' : 0 }}>
                {w.message}{w.count > 1 ? ` (${w.count} candidates)` : ''}
              </p>
            ))}
          </div>
        )}

        <div style={{ marginTop: 24, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.mid2, margin: '0 0 14px' }}>Subject summary</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Subject', 'Registered', 'Presented', 'Pass %', 'A1 to C6'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.subjects.map((subject, i) => {
                  const gradeTotal = Object.values(subject.gradeDistribution).reduce((sum, item) => sum + (item?.boys || 0) + (item?.girls || 0), 0);
                  return (
                    <tr key={subject.name} style={{ borderBottom: i < report.subjects.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: C.dark }}>{subject.name}</td>
                      <td style={{ padding: '9px 12px', color: C.mid2 }}>{subject.registered.total}</td>
                      <td style={{ padding: '9px 12px', color: C.mid2 }}>{subject.presented.total}</td>
                      <td style={{ padding: '9px 12px', color: C.mid2 }}>{subject.percentagePass.total}%</td>
                      <td style={{ padding: '9px 12px', color: C.mid2 }}>{gradeTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: report.officialSummary ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr', gap: 16, marginTop: 20 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.mid2, margin: '0 0 12px' }}>Summary of passes</p>
            {Object.entries(report.summaryOfPasses.buckets)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([count, value]) => (
                <Row key={count} label={`${count} pass${Number(count) === 1 ? '' : 'es'}`} value={value} />
              ))}
            <Row label="Failures" value={report.summaryOfPasses.failures} />
            <Row label="No result" value={report.summaryOfPasses.noResultCandidates} last />
          </div>

          {report.officialSummary && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.mid2, margin: '0 0 12px' }}>WAEC's own summary</p>
              {Object.entries(report.officialSummary)
                .filter(([key]) => key !== 'buckets' && key !== 'totalCandidates')
                .map(([key, value], i, arr) => (
                  <Row key={key} label={key} value={String(value ?? 0)} last={i === arr.length - 1} />
                ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 32, background: C.forest, borderRadius: 10, padding: '28px 28px 30px', color: '#fff' }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Inside CAS, this runs automatically every year</h2>
          <p style={{ fontSize: 13, color: '#D7E8DD', marginTop: 10, lineHeight: 1.7, maxWidth: 560 }}>
            CAS computes this same analysis the moment results are entered, alongside attendance,
            discipline, fees, and every other record your school keeps. We have your details and
            will follow up with a free walkthrough for your school.
          </p>
          <a
            href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`CAS demo request, ${report.schoolName || 'my school'}`)}`}
            style={{ display: 'inline-block', marginTop: 16, padding: '10px 18px', borderRadius: 6, background: '#fff', color: C.forest, fontSize: 13, fontWeight: 700 }}
          >
            Talk to us about CAS for your school
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' | 'success' }) {
  const tones = {
    default: { bg: C.card, border: C.border, text: C.dark },
    warning: { bg: C.warningBg, border: '#EBD3A0', text: '#8A5A08' },
    success: { bg: C.successBg, border: '#C8E3D3', text: C.forest },
  }[tone];

  return (
    <div style={{ borderRadius: 8, border: `1px solid ${tones.border}`, background: tones.bg, padding: 14 }}>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: tones.text, margin: '6px 0 0' }}>{value}</p>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string | number; last?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: last ? 'none' : `1px solid ${C.border}`, fontSize: 13 }}>
      <span style={{ color: C.mid2 }}>{label}</span>
      <strong style={{ color: C.dark }}>{value}</strong>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>{children}</div>
    </div>
  );
}
