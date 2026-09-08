'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface RevokedScan {
  token_queried: string; response_status: string;
  scanned_at: string; ip_address: string | null;
  issue_number: number; revoked_at: string | null;
  student_id: string; student_name: string; student_code: string; class_name: string;
}
interface MultiIpEvent {
  token_queried: string; window_start: string; window_end: string; ip_count: number;
  student_id: string; student_name: string; student_code: string;
  class_name: string; card_status: string;
}
interface OddHourScan {
  token_queried: string; response_status: string;
  scanned_at: string; ip_address: string | null;
  issue_number: number; local_hour: number;
  student_id: string; student_name: string; student_code: string; class_name: string;
}
interface Anomalies {
  revoked_scans: RevokedScan[];
  multi_ip_events: MultiIpEvent[];
  odd_hour_scans: OddHourScan[];
  generated_at: string;
}

function Badge({ count, color }: { count: number; color: string }) {
  return (
    <span className="ml-2 inline-flex items-center justify-center text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px]"
      style={{ background: color === 'red' ? '#FEE2E2' : color === 'amber' ? '#FEF3C7' : '#EFF6FF',
               color: color === 'red' ? '#991B1B' : color === 'amber' ? '#92400E' : '#1D4ED8' }}>
      {count}
    </span>
  );
}

function ts(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 text-sm rounded-lg"
      style={{ background: '#F0FDF4', color: '#145C44' }}>
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
      {text}
    </div>
  );
}

function SectionHeader({ title, color, count, description }: {
  title: string; color: string; count: number; description: string;
}) {
  return (
    <div className="px-5 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-bold" style={{ color: '#1C1208' }}>{title}</h2>
        <Badge count={count} color={color} />
      </div>
      <p className="text-xs" style={{ color: '#94A3B8' }}>{description}</p>
    </div>
  );
}

export default function IDCardAnomaliesPage() {
  const [data,    setData]    = useState<Anomalies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data: d } = await api.get<Anomalies>('/api/id-cards/anomalies');
      setData(d);
    } catch {
      setError('Failed to load anomaly data.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1C1208' }}>ID Card Scan Audit</h1>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
            Flagged scan events for review — last 30 days
            {data?.generated_at && (
              <span className="ml-2">· refreshed {ts(data.generated_at)}</span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors disabled:opacity-50"
          style={{ borderColor: '#E2D9CC', color: '#4A3F32' }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading && !data && (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#991B1B' }}>
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-5">

          {/* ── Revoked-card scans ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            <SectionHeader
              title="Revoked Card Scans"
              color="red"
              count={data.revoked_scans.length}
              description="A revoked card was presented at a reader — the physical card may still be in circulation."
            />
            <div className="p-5">
              {data.revoked_scans.length === 0 ? (
                <EmptyState text="No revoked-card scans in the last 30 days." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                        {['Student', 'Class', 'Scanned at', 'IP', 'Card revoked'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: '#94A3B8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.revoked_scans.map((s, i) => (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: '#F8F5F0' }}>
                          <td className="px-4 py-2.5">
                            <Link href={`/students/${s.student_id}`}
                              className="font-semibold hover:underline" style={{ color: '#1C1208' }}>
                              {s.student_name}
                            </Link>
                            <div className="text-xs font-mono" style={{ color: '#94A3B8' }}>{s.student_code}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: '#64748B' }}>{s.class_name}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>{ts(s.scanned_at)}</td>
                          <td className="px-4 py-2.5 text-xs font-mono" style={{ color: '#94A3B8' }}>
                            {s.ip_address ?? <span className="italic text-gray-300">purged</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: '#94A3B8' }}>
                            {s.revoked_at ? ts(s.revoked_at) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Multi-IP events ────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            <SectionHeader
              title="Multiple-Location Scans"
              color="red"
              count={data.multi_ip_events.length}
              description="Same card scanned from 3 or more distinct IPs within a 6-hour window — rough indicator of implausible simultaneous use."
            />
            <div className="p-5">
              {data.multi_ip_events.length === 0 ? (
                <EmptyState text="No multi-IP events detected in the last 30 days." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                        {['Student', 'Class', 'Distinct IPs', 'Window start', 'Window end', 'Card'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: '#94A3B8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.multi_ip_events.map((e, i) => (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: '#F8F5F0' }}>
                          <td className="px-4 py-2.5">
                            <Link href={`/students/${e.student_id}`}
                              className="font-semibold hover:underline" style={{ color: '#1C1208' }}>
                              {e.student_name}
                            </Link>
                            <div className="text-xs font-mono" style={{ color: '#94A3B8' }}>{e.student_code}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: '#64748B' }}>{e.class_name}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold"
                              style={{ background: '#FEE2E2', color: '#991B1B' }}>{e.ip_count}</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>{ts(e.window_start)}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>{ts(e.window_end)}</td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: '#94A3B8' }}>
                            {e.card_status !== 'active' ? (
                              <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                                style={{ background: '#FEF3C7', color: '#92400E' }}>{e.card_status}</span>
                            ) : 'active'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Off-hours scans ────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            <SectionHeader
              title="Off-Hours Scans"
              color="amber"
              count={data.odd_hour_scans.length}
              description="Valid card scans before 05:00 or after 23:00 (Ghana time). Loose signal — legitimate late events are expected."
            />
            <div className="p-5">
              {data.odd_hour_scans.length === 0 ? (
                <EmptyState text="No off-hours scans in the last 30 days." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                        {['Student', 'Class', 'Local time', 'Result', 'IP'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: '#94A3B8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.odd_hour_scans.map((s, i) => {
                        const dt = new Date(s.scanned_at);
                        const localTime = dt.toLocaleString('en-GB', {
                          timeZone: 'Africa/Accra',
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        });
                        return (
                          <tr key={i} className="border-b last:border-0" style={{ borderColor: '#F8F5F0' }}>
                            <td className="px-4 py-2.5">
                              <Link href={`/students/${s.student_id}`}
                                className="font-semibold hover:underline" style={{ color: '#1C1208' }}>
                                {s.student_name}
                              </Link>
                              <div className="text-xs font-mono" style={{ color: '#94A3B8' }}>{s.student_code}</div>
                            </td>
                            <td className="px-4 py-2.5 text-xs" style={{ color: '#64748B' }}>{s.class_name}</td>
                            <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                              <span className="font-semibold" style={{ color: '#92400E' }}>
                                {String(s.local_hour).padStart(2, '0')}:xx
                              </span>
                              <span className="ml-1.5" style={{ color: '#64748B' }}>{localTime}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                                style={{ background: '#DCFCE7', color: '#145C44' }}>
                                {s.response_status === 'valid_auth' ? 'Valid (auth)' : 'Valid'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs font-mono" style={{ color: '#94A3B8' }}>
                              {s.ip_address ?? <span className="italic text-gray-300">purged</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
