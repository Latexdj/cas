'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';

interface Slot {
  id: string;
  startTime: string; endTime: string;
  subject: string; classNames: string;
  teacherName: string; teacherCode: string; teacherPhone: string | null;
  leaveType: string | null;
  status: 'confirmed' | 'absent' | 'upcoming' | 'ongoing' | 'not_submitted' | 'on_leave';
}

function CallBtn({ phone, color }: { phone: string | null; color: string }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone}`}
      title={`Call ${phone}`}
      onClick={e => e.stopPropagation()}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: `${color}22`, color, textDecoration: 'none',
        border: `1.5px solid ${color}55`,
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
      </svg>
    </a>
  );
}

const STATUS_META: Record<Slot['status'], { label: string; bg: string; bgDark: string; text: string }> = {
  confirmed:     { label: 'Confirmed',      bg: '#DCFCE7', bgDark: '#14532D44', text: '#15803D' },
  absent:        { label: 'Absent',         bg: '#FEE2E2', bgDark: '#7F1D1D44', text: '#DC2626' },
  on_leave:      { label: 'On Leave',       bg: '#FAF5FF', bgDark: '#3B0764AA', text: '#9333EA' },
  ongoing:       { label: 'Ongoing',        bg: '#DBEAFE', bgDark: '#1E3A5F44', text: '#1D4ED8' },
  upcoming:      { label: 'Upcoming',       bg: '#F3F4F6', bgDark: '#1E293B88', text: '#6B7280' },
  not_submitted: { label: 'Not Submitted',  bg: '#FEF3C7', bgDark: '#78350F44', text: '#D97706' },
};

function fmt(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function OccupancyPage() {
  const { theme }             = useTheme();
  const [mounted, setMounted] = useState(false);
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots]     = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true); setError('');
    principalApi.get(`/api/principal/occupancy?date=${date}`)
      .then(r => setSlots(r.data.slots ?? []))
      .catch(() => setError('Failed to load occupancy data.'))
      .finally(() => setLoading(false));
  }, [date]);

  const dark = mounted && theme === 'dark';

  // Group by time slot
  const grouped = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    const key = `${s.startTime}–${s.endTime}`;
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  const statusCounts = Object.entries(STATUS_META).map(([k, v]) => ({
    status: k, label: v.label, count: slots.filter(s => s.status === k).length,
    bg: dark ? v.bgDark : v.bg, text: v.text,
  }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A', flex: 1 }}>
          Classroom Occupancy
        </h2>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{
            border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF',
            color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
          }}
        />
      </div>

      {/* Legend / summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {statusCounts.map(s => (
          <div key={s.status} style={{
            background: s.bg, color: s.text, borderRadius: 20,
            padding: '4px 12px', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{s.count}</span> {s.label}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#EF4444' }}>{error}</div>
      ) : slots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>
          No timetable slots found for this date.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {Object.entries(grouped).map(([timeKey, group]) => (
            <div key={timeKey}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: dark ? '#94A3B8' : '#64748B',
                marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{
                  background: dark ? '#334155' : '#F1F5F9', borderRadius: 6,
                  padding: '3px 10px', fontFamily: 'monospace',
                }}>
                  {fmt(group[0].startTime)} – {fmt(group[0].endTime)}
                </span>
                <span style={{ fontSize: 11, color: dark ? '#475569' : '#CBD5E1' }}>
                  {group.length} class{group.length !== 1 ? 'es' : ''}
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 10,
              }}>
                {group.map(slot => {
                  const meta = STATUS_META[slot.status];
                  return (
                    <div key={slot.id} style={{
                      background: dark ? '#1E293B' : '#FFFFFF',
                      border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
                      borderRadius: 12, padding: '14px 16px',
                      borderLeft: `4px solid ${meta.text}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: dark ? '#F1F5F9' : '#0F172A' }}>
                          {slot.classNames}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, background: dark ? meta.bgDark : meta.bg,
                          color: meta.text, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap',
                        }}>
                          {meta.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: dark ? '#94A3B8' : '#64748B', marginBottom: 4 }}>
                        {slot.subject}
                      </div>
                      <div style={{ fontSize: 12, color: dark ? '#64748B' : '#94A3B8' }}>
                        <span>
                          {slot.teacherName}
                          <span style={{ marginLeft: 4, fontFamily: 'monospace', fontSize: 11 }}>
                            ({slot.teacherCode})
                          </span>
                        </span>
                        {slot.leaveType && (
                          <span style={{
                            display: 'inline-block', marginLeft: 6,
                            fontSize: 10, fontWeight: 700,
                            background: dark ? '#3B076488' : '#EDE9FE',
                            color: '#9333EA', borderRadius: 20, padding: '1px 7px',
                          }}>
                            {slot.leaveType}
                          </span>
                        )}
                        {slot.teacherPhone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 11 }}>{slot.teacherPhone}</span>
                            <CallBtn phone={slot.teacherPhone} color={meta.text} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
