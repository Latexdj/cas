// Opens the right screen when a lesson reminder is tapped (phones only).
import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { routeForReminder } from '@/lib/reminders';

export function ReminderTapHandler() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    const target = routeForReminder(response.notification.request.content.data as Record<string, unknown>);
    if (target) router.push(target as never);
  }, [response]);
  return null;
}
