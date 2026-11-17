// Lesson reminders: a bell on the phone a few minutes before each lesson and
// remedial. Scheduled locally on the phone, so they ring even without data.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { storage } from './storage';
import { planReminders, ymd, type PlanRemedial, type PlanSlot, type PlannedReminder } from './reminderPlan';

const K_SETTINGS = 'cas_t_reminders';
const K_NEXT = 'cas_t_reminders_next';
const K_LAST = 'cas_t_reminders_last_run';

export type ReminderSound = 'long' | 'short';
export interface ReminderSettings { enabled: boolean; minutes: number; lessons: boolean; remedials: boolean; sound: ReminderSound; prompted?: boolean }
export const DEFAULT_SETTINGS: ReminderSettings = { enabled: false, minutes: 5, lessons: true, remedials: true, sound: 'long' };

// One Android channel per sound: a channel's sound cannot change after it is made.
const CHANNEL: Record<ReminderSound, { id: string; name: string; sound: string }> = {
  long: { id: 'lessons-long-v1', name: 'Lesson reminders (long bell)', sound: 'lesson_bell.wav' },
  short: { id: 'lessons-short-v1', name: 'Lesson reminders (short chime)', sound: 'lesson_chime.wav' },
};

// Show reminders (with sound) even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function getSettings(): Promise<ReminderSettings> {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse((await AsyncStorage.getItem(K_SETTINGS)) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export async function saveSettings(s: ReminderSettings) {
  await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(s));
}

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  for (const c of Object.values(CHANNEL)) {
    await Notifications.setNotificationChannelAsync(c.id, {
      name: c.name,
      importance: Notifications.AndroidImportance.MAX,
      sound: c.sound,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lightColor: '#C8973A',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      audioAttributes: { usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
    });
  }
}

/** Asks for permission to show notifications. Returns whether it is granted. */
export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}
export async function permissionState(): Promise<'granted' | 'ask' | 'blocked'> {
  if (Platform.OS === 'web') return 'blocked';
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked';
}

export interface NextReminder { title: string; at: string; count: number }
export async function nextReminder(): Promise<NextReminder | null> {
  try { return JSON.parse((await AsyncStorage.getItem(K_NEXT)) || 'null'); } catch { return null; }
}

async function closedDays(): Promise<Set<string>> {
  const out = new Set<string>();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return ymd(d); });
  const res = await Promise.allSettled(days.map(d => api.get<{ status: string }>(`/api/school-calendar/day-status?date=${d}`)));
  // Holiday, vacation, closed or all-day event: no lessons that day, as on Today.
  res.forEach((r, i) => { if (r.status === 'fulfilled' && r.value.data?.status && r.value.data.status !== 'normal') out.add(days[i]); });
  return out;
}

/**
 * Re-plans every reminder for the next 7 days. Safe to call often: it only
 * re-fetches when forced or at least 15 minutes after the last run.
 */
export async function refreshReminders(force = false): Promise<{ scheduled: number; error?: string }> {
  if (Platform.OS === 'web') return { scheduled: 0 };
  const s = await getSettings();
  if (!s.enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(K_NEXT);
    return { scheduled: 0 };
  }
  const last = Number(await AsyncStorage.getItem(K_LAST)) || 0;
  if (!force && Date.now() - last < 15 * 60 * 1000) return { scheduled: -1 };
  if ((await permissionState()) !== 'granted') return { scheduled: 0, error: 'Notifications are turned off for CAS Teacher in your phone settings.' };

  const userId = await storage.getUserId();
  if (!userId) return { scheduled: 0 };
  let slots: PlanSlot[] = [], remedials: PlanRemedial[] = [], closed = new Set<string>();
  try {
    const [tt, rm, cd] = await Promise.all([
      api.get<PlanSlot[]>(`/api/timetable/teacher/${userId}`),
      s.remedials ? api.get<PlanRemedial[]>(`/api/remedial/teacher/${userId}`).catch(() => ({ data: [] as PlanRemedial[] })) : Promise.resolve({ data: [] as PlanRemedial[] }),
      closedDays(),
    ]);
    slots = Array.isArray(tt.data) ? tt.data : [];
    remedials = Array.isArray(rm.data) ? rm.data : [];
    closed = cd;
  } catch {
    // Offline: keep the reminders already scheduled.
    return { scheduled: -1, error: 'Could not refresh the timetable. Reminders already set stay on.' };
  }

  const plan: PlannedReminder[] = planReminders(slots, remedials, s, closed);
  await ensureChannels();
  await Notifications.cancelAllScheduledNotificationsAsync();
  const channelId = CHANNEL[s.sound].id;
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: p.title, body: p.body, sound: CHANNEL[s.sound].sound,
        data: { kind: p.kind, slotId: p.slotId ?? null, remedialId: p.remedialId ?? null, date: ymd(p.startsAt) },
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId },
    });
  }
  await AsyncStorage.setItem(K_LAST, String(Date.now()));
  await AsyncStorage.setItem(K_NEXT, JSON.stringify(plan[0] ? { title: plan[0].title, at: plan[0].at.toISOString(), count: plan.length } : null));
  return { scheduled: plan.length };
}

/** Rings a sample reminder in 5 seconds with the chosen sound. */
export async function testReminder(sound: ReminderSound) {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Mathematics with 2 Arts A', body: 'This is how a lesson reminder sounds. Starts in 5 minutes.', sound: CHANNEL[sound].sound, data: { kind: 'test' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL[sound].id },
  });
}

/** Called when a teacher taps a reminder: where to go. */
export function routeForReminder(data: Record<string, unknown> | undefined): { pathname: string; params?: Record<string, string> } | null {
  if (!data) return null;
  if (data.kind === 'lesson' && data.slotId) return { pathname: '/(tabs)/submit', params: { slotId: String(data.slotId) } };
  if (data.kind === 'remedial') return { pathname: '/absences/remedials' };
  return null;
}
