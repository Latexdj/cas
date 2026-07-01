'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Notification {
  id:         string;
  message:    string;
  link:       string | null;
  is_read:    boolean;
  created_at: string;
}

export function NotificationsBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs,  setShowNotifs]  = useState(false);
  const [notifs,      setNotifs]      = useState<Notification[]>([]);

  async function fetchNotifs() {
    try {
      const { data } = await api.get<Notification[]>('/api/result-submissions/notifications');
      setNotifs(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, []);

  async function markAllRead() {
    try {
      await api.post('/api/result-submissions/notifications/mark-read', {});
      setNotifs(n => n.map(x => ({ ...x, is_read: true })));
      setUnreadCount(0);
    } catch { /* non-fatal */ }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => {
          setShowNotifs(v => !v);
          if (!showNotifs && unreadCount > 0) markAllRead();
        }}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 20, height: 20, color: '#64748B' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 2, background: '#DC2626', color: '#fff', fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showNotifs && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowNotifs(false)} />
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 320, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, boxShadow: '0 10px 40px rgba(0,0,0,0.15)', zIndex: 50, maxHeight: 400, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Notifications</span>
              <button onClick={markAllRead} style={{ fontSize: 11, color: '#15803D', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark all read</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifs.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>No notifications</div>
              ) : notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => { if (n.link && typeof window !== 'undefined') window.location.href = n.link; setShowNotifs(false); }}
                  style={{ padding: '10px 16px', borderBottom: '1px solid #F8FAFC', cursor: n.link ? 'pointer' : 'default', background: n.is_read ? '#fff' : '#F0FDF4' }}
                >
                  <p style={{ fontSize: 13, color: '#0F172A', margin: 0, lineHeight: 1.4 }}>{n.message}</p>
                  <p style={{ fontSize: 11, color: '#94A3B8', margin: '3px 0 0' }}>
                    {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
