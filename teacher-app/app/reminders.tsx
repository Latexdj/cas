import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Switch, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  DEFAULT_SETTINGS, getSettings, nextReminder, permissionState, refreshReminders, requestPermission, saveSettings, testReminder,
  type NextReminder, type ReminderSettings,
} from '@/lib/reminders';
import { Body, Button, Card, ChoiceChips, Divider, Notice, Screen, SectionLabel } from '@/components/ui/kit';

export default function RemindersScreen() {
  const C = useTheme();
  const [s, setS] = useState<ReminderSettings>(DEFAULT_SETTINGS);
  const [perm, setPerm] = useState<'granted' | 'ask' | 'blocked'>('ask');
  const [next, setNext] = useState<NextReminder | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'info' | 'bad' } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setS(await getSettings()); setPerm(await permissionState()); setNext(await nextReminder());
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function apply(next: ReminderSettings) {
    setS(next); setBusy(true); setMsg(null);
    try {
      if (next.enabled && (await permissionState()) !== 'granted') {
        const ok = await requestPermission();
        setPerm(await permissionState());
        if (!ok) {
          next = { ...next, enabled: false }; setS(next);
          setMsg({ text: 'CAS Teacher is not allowed to show notifications. Allow them in your phone settings to get reminders.', tone: 'bad' });
        }
      }
      await saveSettings(next);
      const r = await refreshReminders(true);
      if (r.error) setMsg({ text: r.error, tone: 'bad' });
      else if (next.enabled) setMsg({ text: r.scheduled > 0 ? `${r.scheduled} reminder${r.scheduled === 1 ? '' : 's'} set for the next 7 days.` : 'No lessons in the next 7 days, so no reminders yet.', tone: 'ok' });
      else setMsg({ text: 'Reminders are off.', tone: 'info' });
      setNext(await nextReminder());
    } finally { setBusy(false); }
  }

  async function test() {
    if (perm !== 'granted' && !(await requestPermission())) {
      setPerm(await permissionState());
      setMsg({ text: 'Allow notifications for CAS Teacher first.', tone: 'bad' }); return;
    }
    await testReminder(s.sound);
    setMsg({ text: 'A sample reminder rings in 5 seconds. You can lock the phone to hear it as you would before a lesson.', tone: 'info' });
  }

  if (Platform.OS === 'web') {
    return <Screen><Notice tone="info" text="Lesson reminders work in the CAS Teacher app on a phone." /></Screen>;
  }

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>Ring before each lesson</Text>
            <Body soft small>A bell and a message a few minutes before your lessons and remedials, even with no data.</Body>
          </View>
          <Switch value={s.enabled} disabled={busy} onValueChange={v => apply({ ...s, enabled: v })}
            accessibilityLabel="Lesson reminders" trackColor={{ true: C.primaryText, false: C.border }} />
        </View>
        {s.enabled && next && (
          <Body small soft>
            Next: {next.title}, {new Date(next.at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. {next.count} set for the next 7 days.
          </Body>
        )}
      </Card>

      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {perm === 'blocked' && (
        <Card>
          <Body>Notifications for CAS Teacher are turned off in your phone settings, so reminders cannot ring.</Body>
          <Button label="Open phone settings" kind="secondary" onPress={() => Linking.openSettings()} />
        </Card>
      )}

      <SectionLabel>How it rings</SectionLabel>
      <Card>
        <ChoiceChips label="Minutes before" value={s.minutes} options={[2, 5, 10, 15].map(m => ({ key: m, label: `${m} min` }))}
          onChange={m => apply({ ...s, minutes: m })} />
        <Divider />
        <ChoiceChips label="Sound" value={s.sound} options={[{ key: 'long', label: 'Long bell (25 s)' }, { key: 'short', label: 'Short chime' }]}
          onChange={v => apply({ ...s, sound: v })} />
        <Button label="Play a test reminder" kind="secondary" icon="notifications-outline" onPress={test} />
        <Divider />
        <ChoiceChips label="Remind me about" value={s.lessons && s.remedials ? 'both' : s.lessons ? 'lessons' : 'remedials'}
          options={[{ key: 'both', label: 'Lessons and remedials' }, { key: 'lessons', label: 'Lessons only' }, { key: 'remedials', label: 'Remedials only' }]}
          onChange={v => apply({ ...s, lessons: v !== 'remedials', remedials: v !== 'lessons' })} />
      </Card>

      <Body soft small>
        Reminders follow your timetable and skip holidays, vacations and closed days. They update whenever you open the app, so open it now and then after the timetable changes. Tapping a lesson reminder opens Submit attendance for that lesson. The sound plays at your phone's notification volume, and silent or Do Not Disturb mode keeps it quiet.
      </Body>
    </Screen>
  );
}
