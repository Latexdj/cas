'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface ClearanceItem {
  id: string; office_id: string; office_name: string; office_type: string; sort_order: number;
  status: 'pending' | 'cleared' | 'not_cleared'; notes: string | null; actioned_at: string | null;
}
interface ClearanceData {
  status: 'not_initiated' | 'in_progress' | 'action_required' | 'fully_cleared';
  initiated_at: string | null; fully_cleared_at: string | null;
  items: ClearanceItem[];
}

const STATUS_STYLE = {
  cleared:     { icon: '✓', bg: 'bg-green-50',  border: 'border-green-200', dot: 'bg-green-500',  text: 'text-green-700',  label: 'Cleared'     },
  not_cleared: { icon: '✗', bg: 'bg-red-50',    border: 'border-red-200',   dot: 'bg-red-500',    text: 'text-red-700',    label: 'Not Cleared' },
  pending:     { icon: '○', bg: 'bg-white',      border: 'border-slate-200', dot: 'bg-amber-400',  text: 'text-amber-700',  label: 'Pending'     },
};

const OVERALL_STYLE = {
  not_initiated:  { bg: 'bg-slate-100',  border: 'border-slate-200', text: 'text-slate-600',  label: 'Not Started',      sub: 'Your clearance has not been initiated yet.' },
  in_progress:    { bg: 'bg-amber-50',   border: 'border-amber-200', text: 'text-amber-700',  label: 'In Progress',      sub: 'Awaiting sign-off from some offices.' },
  action_required:{ bg: 'bg-red-50',     border: 'border-red-200',   text: 'text-red-700',    label: 'Action Required',  sub: 'One or more offices have not cleared you. See details below.' },
  fully_cleared:  { bg: 'bg-green-50',   border: 'border-green-300', text: 'text-green-700',  label: 'Fully Cleared',    sub: 'You have been cleared by all offices. You may collect your certificate.' },
};

export default function StudentClearancePage() {
  const [data,       setData]       = useState<ClearanceData | null>(null);
  const [feeBalance, setFeeBalance] = useState<number | null>(null);
  const [loading,    setLoading]    = useState(true);
  const colors  = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
  const primary = colors.primary;

  useEffect(() => {
    Promise.all([
      studentApi.get<ClearanceData>('/api/student/clearance')
        .catch(() => ({ data: { status: 'not_initiated' as const, initiated_at: null, fully_cleared_at: null, items: [] } })),
      studentApi.get<{ summary: { outstanding: number } }>('/api/student/fees')
        .then(r => r.data.summary.outstanding)
        .catch(() => null),
    ]).then(([clRes, outstanding]) => {
      setData(clRes.data);
      setFeeBalance(outstanding);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
    </div>
  );

  const overall = OVERALL_STYLE[data?.status ?? 'not_initiated'];
  const cleared  = data?.items.filter(i => i.status === 'cleared').length ?? 0;
  const total    = data?.items.length ?? 0;
  const pct      = total > 0 ? Math.round((cleared / total) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-xl mx-auto">

      {/* Overall status banner */}
      <div className={`rounded-2xl border p-5 ${overall.bg} ${overall.border}`}>
        <div className="flex items-center gap-3 mb-2">
          {data?.status === 'fully_cleared' ? (
            <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ) : data?.status === 'action_required' ? (
            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          )}
          <div>
            <p className={`font-bold text-lg ${overall.text}`}>{overall.label}</p>
            <p className={`text-xs ${overall.text} opacity-80`}>{overall.sub}</p>
          </div>
        </div>

        {total > 0 && (
          <>
            <div className="flex justify-between text-xs mb-1.5 mt-3">
              <span className={overall.text}>{cleared} of {total} offices cleared</span>
              <span className={`font-bold ${overall.text}`}>{pct}%</span>
            </div>
            <div className="w-full bg-white/60 rounded-full h-2.5 overflow-hidden">
              <div className="h-2.5 rounded-full transition-all"
                style={{ width: `${pct}%`, background: data?.status === 'fully_cleared' ? '#16a34a' : data?.status === 'action_required' ? '#dc2626' : '#f59e0b' }} />
            </div>
          </>
        )}

        {data?.fully_cleared_at && (
          <p className="text-xs text-green-600 mt-2 font-semibold">
            Cleared on {new Date(data.fully_cleared_at).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Synthetic fees clearance item */}
      {feeBalance !== null && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Finance</p>
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${feeBalance > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5 ${feeBalance > 0 ? 'bg-red-500' : 'bg-green-500'}`}>
              {feeBalance > 0 ? '✗' : '✓'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className={`font-semibold text-sm ${feeBalance > 0 ? 'text-red-700' : 'text-green-700'}`}>Accounts Office</p>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${feeBalance > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                  {feeBalance > 0 ? 'Not Cleared' : 'Cleared'}
                </span>
              </div>
              {feeBalance > 0 ? (
                <div className="mt-1.5 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-700 font-semibold">
                    Outstanding balance: GH₵ {feeBalance.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <Link href="/student/fees" className="text-xs text-red-600 underline font-medium mt-0.5 inline-block">View fee statement →</Link>
                </div>
              ) : (
                <p className="text-xs text-green-600 mt-1">All fees fully paid.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Office checklist */}
      {data?.items && data.items.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Clearance Checklist</p>
          {data.items.map(item => {
            const st = STATUS_STYLE[item.status];
            return (
              <div key={item.id} className={`rounded-xl border p-4 flex items-start gap-3 ${st.bg} ${st.border}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5 ${st.dot}`}>
                  {st.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className={`font-semibold text-sm ${st.text}`}>{item.office_name}</p>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${st.bg} ${st.text} border ${st.border}`}>{st.label}</span>
                  </div>
                  {item.status === 'not_cleared' && item.notes && (
                    <div className="mt-1.5 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                      <p className="text-xs text-red-700 font-semibold">Reason: {item.notes}</p>
                    </div>
                  )}
                  {item.status === 'cleared' && item.notes && (
                    <p className="text-xs text-green-600 mt-1">{item.notes}</p>
                  )}
                  {item.actioned_at && (
                    <p className="text-[10px] text-slate-400 mt-1">{new Date(item.actioned_at).toLocaleString()}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Not initiated state */}
      {data?.status === 'not_initiated' && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
              <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          </div>
          <p className="text-slate-600 font-semibold">Clearance Not Started</p>
          <p className="text-sm text-slate-400 mt-1">Your clearance process has not been initiated. Please contact your school administrator.</p>
        </div>
      )}
    </div>
  );
}
