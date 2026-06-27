'use client';
import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface Bill {
  id: string;
  label: string | null;
  fee_item_name: string | null;
  schedule_name: string | null;
  amount: number;
  amount_paid: number;
  balance: number;
  due_date: string | null;
  created_at: string;
}
interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  receipt_number: string | null;
  notes: string | null;
  fee_item_name: string | null;
  bill_label: string | null;
}
interface Summary { total_billed: number; total_paid: number; outstanding: number; }
interface FeesData { summary: Summary; bills: Bill[]; payments: Payment[]; }

const fmt = (n: number) =>
  'GH₵ ' + n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });

function StatusBadge({ balance, amount }: { balance: number; amount: number }) {
  if (balance <= 0)             return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Paid</span>;
  if (balance < amount)         return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Part Paid</span>;
  return                               <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Unpaid</span>;
}

type Tab = 'bills' | 'payments';

export default function StudentFeesPage() {
  const [data,     setData]     = useState<FeesData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error,    setError]    = useState(false);
  const [tab,      setTab]      = useState<Tab>('bills');
  const colors  = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    studentApi.get<FeesData>('/api/student/fees')
      .then(r => setData(r.data))
      .catch((e: unknown) => {
        const err = e as { response?: { status?: number } };
        if (err?.response?.status === 403) setDisabled(true);
        else setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
    </div>
  );

  if (disabled) return (
    <div className="p-6 text-center">
      <p className="text-slate-500 font-semibold">Fee statements are not available for your school.</p>
    </div>
  );

  if (error || !data) return (
    <div className="p-6 text-center space-y-3">
      <p className="text-slate-500 font-semibold">Could not load your fee statement.</p>
      <p className="text-slate-400 text-sm">Please check your connection and try again.</p>
      <button
        onClick={() => { setError(false); setLoading(true); studentApi.get<FeesData>('/api/student/fees').then(r => setData(r.data)).catch(() => setError(true)).finally(() => setLoading(false)); }}
        className="text-sm font-semibold px-4 py-2 rounded-xl text-white"
        style={{ background: primary }}
      >
        Retry
      </button>
    </div>
  );

  const { summary, bills, payments } = data;
  const hasOutstanding = summary.outstanding > 0;
  const collectionPct  = summary.total_billed > 0
    ? Math.round((summary.total_paid / summary.total_billed) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-xl mx-auto">

      {/* Outstanding alert */}
      {hasOutstanding && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0 mt-0.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-bold text-red-700">Outstanding Balance — {fmt(summary.outstanding)}</p>
            <p className="text-xs text-red-600 mt-0.5">Please settle your outstanding fees. Unpaid balances may affect your clearance.</p>
          </div>
        </div>
      )}

      {/* Summary card */}
      <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}>
        <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-4">Fee Statement</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Billed', value: fmt(summary.total_billed), color: 'text-white' },
            { label: 'Total Paid',   value: fmt(summary.total_paid),   color: 'text-green-300' },
            { label: 'Outstanding',  value: fmt(summary.outstanding),  color: hasOutstanding ? 'text-red-300' : 'text-green-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className={`text-base font-black ${color}`}>{value}</p>
              <p className="text-white/60 text-[10px] font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        {summary.total_billed > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-white/60 mb-1">
              <span>Payment Progress</span>
              <span className="font-bold text-white">{collectionPct}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${collectionPct}%`, background: collectionPct >= 100 ? '#4ade80' : collectionPct >= 60 ? '#fbbf24' : '#f87171' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1">
        {(['bills', 'payments'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: tab === t ? primary : 'transparent',
              color: tab === t ? 'white' : '#64748B',
            }}
          >
            {t === 'bills' ? `Bills (${bills.length})` : `Payments (${payments.length})`}
          </button>
        ))}
      </div>

      {/* Bills tab */}
      {tab === 'bills' && (
        <div className="space-y-3">
          {bills.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 p-8 text-center">
              <p className="text-slate-400 text-sm font-medium">No fee bills yet</p>
            </div>
          ) : bills.map(bill => {
            const name = bill.fee_item_name || bill.label || bill.schedule_name || 'Fee Bill';
            return (
              <div key={bill.id} className="bg-white rounded-xl border border-slate-100 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
                    {bill.schedule_name && bill.fee_item_name && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{bill.schedule_name}</p>
                    )}
                  </div>
                  <StatusBadge balance={bill.balance} amount={bill.amount} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium">Billed</p>
                    <p className="text-sm font-bold text-slate-700">{fmt(bill.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium">Paid</p>
                    <p className="text-sm font-bold text-green-600">{fmt(bill.amount_paid)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium">Balance</p>
                    <p className={`text-sm font-bold ${bill.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(bill.balance)}</p>
                  </div>
                </div>
                {bill.due_date && (
                  <p className="text-[10px] text-slate-400 mt-2">Due: {fmtDate(bill.due_date)}</p>
                )}
                {bill.balance > 0 && bill.amount > 0 && (
                  <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${Math.min(Math.round((bill.amount_paid / bill.amount) * 100), 100)}%`, background: primary }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payments tab */}
      {tab === 'payments' && (
        <div className="space-y-3">
          {payments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 p-8 text-center">
              <p className="text-slate-400 text-sm font-medium">No payments recorded yet</p>
            </div>
          ) : payments.map(pmt => {
            const label = pmt.fee_item_name || pmt.bill_label || 'Payment';
            return (
              <div key={pmt.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800 truncate">{label}</p>
                    <p className="text-sm font-black text-green-600 shrink-0">{fmt(pmt.amount)}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-slate-400">{fmtDate(pmt.payment_date)}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className="text-[10px] text-slate-500 font-medium">{pmt.payment_method}</span>
                    {pmt.receipt_number && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="text-[10px] font-mono text-slate-400">{pmt.receipt_number}</span>
                      </>
                    )}
                  </div>
                  {pmt.notes && <p className="text-[10px] text-slate-400 mt-1 italic">{pmt.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
