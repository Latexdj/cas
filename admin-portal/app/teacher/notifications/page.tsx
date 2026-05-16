'use client';
import { useCallback, useEffect, useState } from 'react';
import { teacherApi } from '@/lib/teacher-api';

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const [items,   setItems]   = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await teacherApi.get<Notification[]>('/api/notifications');
      setItems(data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markAllRead() {
    await teacherApi.patch('/api/notifications/read-all', {});
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await teacherApi.patch(`/api/notifications/${id}/read`, {});
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const unread = items.filter(n => !n.read).length;

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">Notifications</h1>
          <p className="text-xs text-[#8C7E6E] mt-0.5">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ color: '#2D7A4F', background: '#E4F4EB' }}>
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-[#E2D9CC]" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-10 text-center">
          <p className="text-3xl mb-2">🔔</p>
          <p className="text-sm font-semibold text-[#2C2218]">No notifications yet</p>
          <p className="text-xs text-[#8C7E6E] mt-1">You'll see system messages here when they arrive.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(n => (
            <div key={n.id}
              className="bg-white rounded-2xl border p-4 transition-colors"
              style={{ borderColor: n.read ? '#E2D9CC' : '#FCA5A5', background: n.read ? 'white' : '#FFF8F8' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                    <p className="text-sm font-bold text-[#2C2218] truncate">{n.title}</p>
                  </div>
                  <p className="text-xs text-[#5C4F42] leading-relaxed">{n.message}</p>
                  <p className="text-xs text-[#8C7E6E] mt-2">{formatTime(n.created_at)}</p>
                </div>
                {!n.read && (
                  <button onClick={() => markRead(n.id)}
                    className="text-xs font-semibold shrink-0 px-2.5 py-1 rounded-lg"
                    style={{ color: '#8C7E6E', background: '#F4EFE6' }}>
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
