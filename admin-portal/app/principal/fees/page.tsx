'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';

interface Summary {
  total_billed: number;
  total_collected: number;
  outstanding: number;
  collection_rate: number;
  total_expenses: number;
  net_position: number;
  students_with_bills: number;
}
interface ClassRow {
  class_name: string;
  students_billed: number;
  total_billed: number;
  total_collected: number;
  outstanding: number;
  collection_rate: number;
}
interface IvsE {
  income: number;
  expenditure: number;
  net: number;
  by_category: { category: string; total: string }[];
}

const fmt = (n: number) =>
  'GH₵ ' + n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function RateBar({ pct, dark }: { pct: number; dark: boolean }) {
  const color = pct >= 80 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: dark ? '#1E293B' : '#E2E8F0', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export default function PrincipalFeesPage() {
  const { theme }   = useTheme();
  const [mounted, setMounted] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [ive,     setIve]     = useState<IvsE | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    async function load() {
      try {
        const [s, c, i] = await Promise.all([
          principalApi.get('/api/principal/fees/summary'),
          principalApi.get('/api/principal/fees/class-breakdown'),
          principalApi.get('/api/principal/fees/income-vs-expenditure'),
        ]);
        setSummary(s.data);
        setClasses(c.data);
        setIve(i.data);
      } catch (e: unknown) {
        const err = e as { response?: { status?: number } };
        if (err?.response?.status === 403) setDisabled(true);
      } finally { setLoading(false); }
    }
    load();
  }, []);

  const dark = mounted && theme === 'dark';
  const c = {
    bg:      dark ? '#0F172A' : '#F1F5F9',
    card:    dark ? '#1E293B' : '#FFFFFF',
    border:  dark ? '#334155' : '#E2E8F0',
    text:    dark ? '#F1F5F9' : '#0F172A',
    sub:     dark ? '#64748B' : '#94A3B8',
    row:     dark ? '#1E293B' : '#FFFFFF',
    rowAlt:  dark ? '#162032' : '#F8FAFC',
    thead:   dark ? '#0F172A' : '#F8FAFC',
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14, padding: 4 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 90, borderRadius: 14, background: c.card, border: `1px solid ${c.border}`, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  if (disabled) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: c.sub }}>
        <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Accounts & Fees Not Enabled</p>
        <p style={{ fontSize: 14 }}>This module has not been activated for your school.</p>
      </div>
    );
  }

  if (!summary) return null;

  const netColor  = summary.net_position >= 0 ? '#10B981' : '#EF4444';
  const netLabel  = summary.net_position >= 0 ? 'Surplus' : 'Deficit';

  const summaryCards = [
    { label: 'Total Billed',      value: fmt(summary.total_billed),      color: dark ? '#38BDF8' : '#0EA5E9',   bg: dark ? '#0C1E36' : '#EFF6FF' },
    { label: 'Fees Collected',    value: fmt(summary.total_collected),   color: '#10B981',                      bg: dark ? '#052E16' : '#F0FDF4' },
    { label: 'Collection Rate',   value: `${summary.collection_rate}%`,  color: summary.collection_rate >= 80 ? '#10B981' : summary.collection_rate >= 50 ? '#F59E0B' : '#EF4444', bg: dark ? '#1C1507' : '#FFFBEB' },
    { label: 'Outstanding Fees',  value: fmt(summary.outstanding),       color: summary.outstanding > 0 ? '#F59E0B' : '#10B981', bg: dark ? '#1C0F07' : '#FFFBEB' },
    { label: 'Total Expenditure', value: fmt(summary.total_expenses),    color: '#EF4444',                      bg: dark ? '#2C0A0A' : '#FEF2F2' },
    { label: netLabel,            value: fmt(Math.abs(summary.net_position)), color: netColor,                  bg: dark ? (summary.net_position >= 0 ? '#052E16' : '#2C0A0A') : (summary.net_position >= 0 ? '#F0FDF4' : '#FEF2F2') },
  ];

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: c.text, marginBottom: 4 }}>Financial Overview</h2>
        <p style={{ fontSize: 13, color: c.sub }}>Read-only summary of fee collections and school expenditure.</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 28 }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.color}22`, borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: c.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{card.label}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: card.color }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Class breakdown */}
      {classes.length > 0 && (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: c.text }}>Fee Collection by Class</p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: c.thead }}>
                  {['Class', 'Students Billed', 'Total Billed', 'Collected', 'Outstanding', 'Collection Rate'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: c.sub, borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classes.map((row, i) => (
                  <tr key={row.class_name} style={{ background: i % 2 === 0 ? c.row : c.rowAlt, borderBottom: `1px solid ${c.border}` }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: c.text }}>{row.class_name}</td>
                    <td style={{ padding: '10px 14px', color: c.sub }}>{row.students_billed}</td>
                    <td style={{ padding: '10px 14px', color: c.text }}>{fmt(row.total_billed)}</td>
                    <td style={{ padding: '10px 14px', color: '#10B981', fontWeight: 600 }}>{fmt(row.total_collected)}</td>
                    <td style={{ padding: '10px 14px', color: row.outstanding > 0 ? '#F59E0B' : '#10B981', fontWeight: 600 }}>{fmt(row.outstanding)}</td>
                    <td style={{ padding: '10px 14px', minWidth: 160 }}>
                      <RateBar pct={row.collection_rate} dark={dark} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: c.thead, borderTop: `2px solid ${c.border}` }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: c.text }}>Total</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: c.text }}>{summary.students_with_bills}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: c.text }}>{fmt(summary.total_billed)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#10B981' }}>{fmt(summary.total_collected)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: summary.outstanding > 0 ? '#F59E0B' : '#10B981' }}>{fmt(summary.outstanding)}</td>
                  <td style={{ padding: '10px 14px' }}><RateBar pct={summary.collection_rate} dark={dark} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Income vs Expenditure */}
      {ive && (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: c.text }}>Income vs. Expenditure</p>
          </div>
          <div style={{ padding: '16px 18px' }}>
            {/* Bar comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total Income (Fees Collected)', value: ive.income, color: '#10B981' },
                { label: 'Total Expenditure', value: ive.expenditure, color: '#EF4444' },
              ].map(item => {
                const maxVal = Math.max(ive.income, ive.expenditure, 1);
                const pct = Math.round((item.value / maxVal) * 100);
                return (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: c.sub }}>{item.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{fmt(item.value)}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: dark ? '#1E293B' : '#E2E8F0', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: 99, transition: 'width .5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Net */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: ive.net >= 0 ? (dark ? '#052E16' : '#F0FDF4') : (dark ? '#2C0A0A' : '#FEF2F2'), marginBottom: ive.by_category.length > 0 ? 16 : 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{ive.net >= 0 ? 'Surplus' : 'Deficit'}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: ive.net >= 0 ? '#10B981' : '#EF4444' }}>{fmt(Math.abs(ive.net))}</span>
            </div>

            {/* Expense breakdown */}
            {ive.by_category.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: c.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Expenditure by Category</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ive.by_category.map(cat => {
                    const catPct = ive.expenditure > 0 ? Math.round((Number(cat.total) / ive.expenditure) * 100) : 0;
                    return (
                      <div key={cat.category}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: c.text }}>{cat.category}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#EF4444' }}>{fmt(Number(cat.total))} <span style={{ color: c.sub, fontWeight: 400 }}>({catPct}%)</span></span>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: dark ? '#1E293B' : '#E2E8F0', overflow: 'hidden' }}>
                          <div style={{ width: `${catPct}%`, height: '100%', background: '#EF4444', opacity: 0.7, borderRadius: 99 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {classes.length === 0 && !ive?.income && !ive?.expenditure && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: c.sub }}>
          <p style={{ fontSize: 15, fontWeight: 600 }}>No financial data yet</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Fee bills and payments will appear here once the bursar records them.</p>
        </div>
      )}
    </div>
  );
}
