// Works out which lesson and remedial reminders to schedule. Pure logic (no
// phone APIs), so it can be checked on its own.

export interface PlanSlot { id: string; day_of_week: number; start_time: string; end_time: string; subject: string; class_names: string; room?: string | null }
export interface PlanRemedial { id: string; subject: string; class_name: string; remedial_date: string; remedial_time: string; location_name: string | null; status: string }
export interface PlanSettings { minutes: number; lessons: boolean; remedials: boolean }
export interface PlannedReminder {
  key: string; at: Date; startsAt: Date; kind: 'lesson' | 'remedial';
  title: string; body: string; slotId?: string; remedialId?: string;
}

const DAYS_AHEAD = 7;
const MAX_REMINDERS = 60;   // well under Android's limit on scheduled alarms

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date); d.setHours(h || 0, m || 0, 0, 0); return d;
};
/** Monday = 1 ... Sunday = 7, as the timetable stores it. */
export const isoDow = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

function inWords(minutes: number) {
  if (minutes <= 0) return 'now';
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * @param closedDays dates (YYYY-MM-DD) with no lessons: holidays, vacation, closed days
 */
export function planReminders(slots: PlanSlot[], remedials: PlanRemedial[], s: PlanSettings, closedDays: Set<string>, now = new Date()): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const soonest = now.getTime() + 30 * 1000;

  if (s.lessons) {
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const day = new Date(now); day.setDate(now.getDate() + i); day.setHours(0, 0, 0, 0);
      if (closedDays.has(ymd(day))) continue;
      const todays = slots.filter(x => x.day_of_week === isoDow(day)).sort((a, b) => a.start_time.localeCompare(b.start_time));
      for (const [k, x] of todays.entries()) {
        // A double period (same class and subject straight after) rings once.
        const prev = todays[k - 1];
        if (prev && prev.subject === x.subject && prev.class_names === x.class_names && prev.end_time.slice(0, 5) === x.start_time.slice(0, 5)) continue;
        const start = at(day, x.start_time);
        const when = new Date(start.getTime() - s.minutes * 60 * 1000);
        if (when.getTime() < soonest) continue;
        out.push({
          key: `l:${x.id}:${ymd(day)}`, at: when, startsAt: start, kind: 'lesson', slotId: x.id,
          title: `${x.subject} with ${x.class_names}`,
          body: `Starts ${inWords(s.minutes)}, at ${x.start_time.slice(0, 5)}${x.room ? `, ${x.room}` : ''}. Tap to take the register.`,
        });
      }
    }
  }

  if (s.remedials) {
    const until = now.getTime() + DAYS_AHEAD * 86400 * 1000;
    for (const r of remedials) {
      if (!['scheduled', 'pending', 'confirmed'].includes(String(r.status).toLowerCase())) continue;
      const [y, mo, d] = r.remedial_date.slice(0, 10).split('-').map(Number);
      const start = at(new Date(y, mo - 1, d), r.remedial_time || '00:00');
      const when = new Date(start.getTime() - s.minutes * 60 * 1000);
      if (when.getTime() < soonest || start.getTime() > until) continue;
      out.push({
        key: `r:${r.id}`, at: when, startsAt: start, kind: 'remedial', remedialId: r.id,
        title: `Remedial: ${r.subject} with ${r.class_name}`,
        body: `Starts ${inWords(s.minutes)}, at ${r.remedial_time.slice(0, 5)}${r.location_name ? `, ${r.location_name}` : ''}.`,
      });
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
}
