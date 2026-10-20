'use client';
import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';

interface NotificationRow {
  id: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

// Reuses the live data already powering the bell-icon dropdowns on the
// admin and teacher portals (GET /api/result-submissions/notifications) —
// just made more visible on the dashboard page itself, in the same
// bg/border/borderLeft alert-banner shape already used there for the
// school-status and subscription-limit banners.
export function UnreadNotificationsBanner({ apiClient, className = '' }: { apiClient: AxiosInstance; className?: string }) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    apiClient.get<NotificationRow[]>('/api/result-submissions/notifications')
      .then(r => setRows(r.data.filter(n => !n.is_read)))
      .catch(() => {});
  }, [apiClient]);

  async function markAllRead() {
    setMarking(true);
    try {
      await apiClient.post('/api/result-submissions/notifications/mark-read', {});
      setDismissed(true);
    } catch {
      // leave the banner up so they can retry
    } finally {
      setMarking(false);
    }
  }

  if (dismissed || rows.length === 0) return null;

  const bg = '#FFF8E1', border = '#FDE68A', color = '#92400E';

  return (
    <div className={`rounded-xl px-4 py-3 flex items-start gap-3 ${className}`}
      style={{ backgroundColor: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${color}` }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
        style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }}>
        <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
      <div className="flex-1">
        <p className="text-sm font-bold" style={{ color }}>
          You have {rows.length} unread notification{rows.length === 1 ? '' : 's'}
        </p>
        <ul className="mt-1 space-y-0.5">
          {rows.slice(0, 3).map(n => (
            <li key={n.id} className="text-xs" style={{ color, opacity: 0.8 }}>
              {n.link ? (
                <a href={n.link} className="underline hover:no-underline">{n.message}</a>
              ) : n.message}
            </li>
          ))}
        </ul>
        <button
          onClick={markAllRead}
          disabled={marking}
          className="text-xs font-semibold mt-2 underline hover:no-underline disabled:opacity-50"
          style={{ color }}
        >
          {marking ? 'Marking…' : 'Mark all as read'}
        </button>
      </div>
    </div>
  );
}
