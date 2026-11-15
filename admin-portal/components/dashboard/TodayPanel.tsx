'use client';
/**
 * The top of the admin dashboard: the school day as a strip of periods, and
 * a short list of what needs the admin's attention.
 *
 * Colour rules: cells are neutral; gold marks the current period; red only
 * counts classes that were not taught or not recorded. Every count carries a
 * word, so nothing relies on colour alone.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type SlotStatus = 'confirmed' | 'absent' | 'on_leave' | 'upcoming' | 'ongoing' | 'not_submitted';
interface Slot {
  id: string; startTime: string; endTime: string; subject: string; classNames: string;
  teacherName: string; teacherCode: string; teacherPhone: string | null; leaveType: string | null; status: SlotStatus;
}
interface OccupancyResponse { date: string; slots: Slot[]; reason?: string; label?: string }

export interface QueueItem { label: string; count: number; href: string; action: string }

const STATUS_WORD: Record<SlotStatus, string> = {
  confirmed: 'Recorded', ongoing: 'In progress', upcoming: 'Later', on_leave: 'On leave',
  absent: 'Teacher absent', not_submitted: 'Not recorded',
};
const hhmm = (t: string) => t.slice(0, 5);

export function TodayPanel({ queues }: { queues: QueueItem[] }) {
  const [data, setData] = useState<OccupancyResponse | null>(null);
  const [error, setError] = useState(false);
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api.get<OccupancyResponse>('/api/admin/occupancy')
      .then(r => { setData(r.data); setError(false); })
      .catch(() => setError(true));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const periods = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of data?.slots ?? []) {
      const k = `${hhmm(s.startTime)}–${hhmm(s.endTime)}`;
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()].map(([key, slots]) => ({
      key, start: hhmm(slots[0].startTime), slots,
      recorded: slots.filter(s => s.status === 'confirmed').length,
      problems: slots.filter(s => s.status === 'absent' || s.status === 'not_submitted').length,
      now: slots.some(s => s.status === 'ongoing'),
      later: slots.every(s => s.status === 'upcoming'),
    }));
  }, [data]);

  const nowIndex = periods.findIndex(p => p.now);
  const active = periods.find(p => p.key === openPeriod);
  const waiting = queues.filter(q => q.count > 0);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="day-heading" className="rounded-xl bg-surface border border-line p-4 md:p-5 min-w-0">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 id="day-heading" className="text-base font-semibold text-ink">{today}</h2>
          <p className="text-sm text-ink-muted">Updates every minute</p>
        </div>

        {error && <p className="text-sm text-bad-ink">Could not load today's periods. Check your connection; the strip retries every minute.</p>}
        {data && data.slots.length === 0 && (
          <p className="text-sm text-ink-muted">
            {data.label ? `${data.label}: no lessons today.` : 'No lessons on the timetable today. Add slots under Teaching › Timetable.'}
          </p>
        )}

        {periods.length > 0 && (
          <>
            <ol className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" aria-label="Periods today">
              {periods.map((p, i) => {
                const isNow = i === nowIndex;
                const selected = p.key === openPeriod;
                return (
                  <li key={p.key} className="flex-1 min-w-[76px]">
                    <button type="button" onClick={() => setOpenPeriod(selected ? null : p.key)} aria-expanded={selected}
                      aria-label={`${p.key}: ${p.recorded} of ${p.slots.length} recorded${p.problems ? `, ${p.problems} not taught or not recorded` : ''}${isNow ? ', current period' : ''}`}
                      className={`relative w-full h-full text-left rounded-lg px-2.5 pt-3 pb-2 border transition-colors ${selected ? 'border-ink-2 bg-sunken' : 'border-line hover:bg-sunken'}`}>
                      {isNow && <span className="absolute inset-x-0 top-0 h-1 rounded-t-lg bg-[#C8973A]" aria-hidden />}
                      <span className={`block font-mono text-sm ${isNow ? 'font-semibold text-ink' : 'text-ink-2'}`}>{p.start}</span>
                      <span className="block text-sm text-ink-muted">{p.later ? `${p.slots.length} later` : `${p.recorded}/${p.slots.length} done`}</span>
                      {p.problems > 0 && <span className="block text-sm font-semibold text-bad-ink">{p.problems} missing</span>}
                      {isNow && <span className="block text-xs font-semibold text-gold-ink">Now</span>}
                    </button>
                  </li>
                );
              })}
            </ol>

            {active && (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {active.slots.map(s => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5">
                    <span className="font-semibold text-ink min-w-[7rem]">{s.classNames}</span>
                    <span className="text-ink-2 flex-1 min-w-[8rem]">{s.subject}, {s.teacherName}</span>
                    <span className={`text-sm ${s.status === 'absent' || s.status === 'not_submitted' ? 'font-semibold text-bad-ink' : 'text-ink-muted'}`}>
                      {STATUS_WORD[s.status]}{s.leaveType ? ` (${s.leaveType})` : ''}
                    </span>
                    {s.teacherPhone && (s.status === 'not_submitted' || s.status === 'ongoing') && (
                      <a href={`tel:${s.teacherPhone}`} className="text-sm font-semibold text-brand-ink">Call {s.teacherPhone}</a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="needs-heading" className="rounded-xl bg-surface border border-line p-4 md:p-5">
        <h2 id="needs-heading" className="text-base font-semibold text-ink mb-2">Needs you</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing is waiting. Leave requests, result approvals and absence flags appear here when they need a decision.</p>
        ) : (
          <ul className="divide-y divide-line">
            {waiting.map(q => (
              <li key={q.label}>
                <Link href={q.href} className="flex items-center gap-3 py-2.5 min-h-[44px] group">
                  <span className="flex-1 text-sm text-ink">{q.label}</span>
                  <span className="font-mono font-semibold text-ink">{q.count}</span>
                  <span className="text-sm font-semibold text-brand-ink group-hover:underline">{q.action} ›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
