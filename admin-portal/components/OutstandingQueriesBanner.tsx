'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AxiosInstance } from 'axios';

interface QueryRow {
  id: string;
  subject: string;
  status: string;
}

// Distinct from UnreadNotificationsBanner: that one tracks the one-time
// "New Query Issued" alert, which disappears once read even if the query
// itself is still outstanding. This reads the queries directly (issued —
// not yet acknowledged — or acknowledged but not yet responded to) so the
// prompt stays up for as long as the teacher actually owes an action,
// and each row deep-links straight to that query on the Conduct page.
export function OutstandingQueriesBanner({ apiClient, className = '' }: { apiClient: AxiosInstance; className?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<QueryRow[]>([]);

  useEffect(() => {
    apiClient.get<QueryRow[]>('/api/discipline/queries')
      .then(r => setRows((r.data ?? []).filter(q => ['issued', 'acknowledged'].includes(q.status))))
      .catch(() => {}); // discipline module not licensed for this school, or a transient error — fail silent
  }, [apiClient]);

  if (rows.length === 0) return null;

  const bg = '#FEF2F2', border = '#FECACA', color = '#B83232';

  return (
    <div className={`rounded-xl px-4 py-3 flex items-start gap-3 ${className}`}
      style={{ backgroundColor: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${color}` }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
        style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <path d="M12 9v4" /><path d="M12 17h.01" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color }}>
          You have {rows.length} quer{rows.length === 1 ? 'y' : 'ies'} requiring action
        </p>
        <ul className="mt-1 space-y-0.5">
          {rows.slice(0, 3).map(q => (
            <li key={q.id}>
              <button
                onClick={() => router.push(`/teacher/conduct?open=${q.id}`)}
                className="text-xs underline hover:no-underline text-left"
                style={{ color, opacity: 0.85 }}
              >
                {q.status === 'issued' ? 'Acknowledge: ' : 'Respond: '}{q.subject}
              </button>
            </li>
          ))}
        </ul>
        {rows.length > 3 && (
          <p className="text-xs mt-1" style={{ color, opacity: 0.7 }}>+{rows.length - 3} more</p>
        )}
        <button
          onClick={() => router.push('/teacher/conduct')}
          className="text-xs font-semibold mt-2 underline hover:no-underline"
          style={{ color }}
        >
          View all queries
        </button>
      </div>
    </div>
  );
}
