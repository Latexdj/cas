import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'cas_offline_queue';

export interface QueuedSubmission {
  id: string;
  queuedAt: string;
  teacherId: string;
  subject: string;
  classNames: string;
  periods: number;
  topic?: string;
  gpsCoordinates?: string;
  locationName?: string;
  imageBase64: string;
  photoSizeKb?: number;
}

export const offlineQueue = {
  async getAll(): Promise<QueuedSubmission[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  },

  async enqueue(item: Omit<QueuedSubmission, 'id' | 'queuedAt'>): Promise<void> {
    const queue = await offlineQueue.getAll();
    queue.push({
      ...item,
      id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      queuedAt: new Date().toISOString(),
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  async remove(id: string): Promise<void> {
    const queue = await offlineQueue.getAll();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.filter(q => q.id !== id)));
  },

  async syncAll(
    postFn: (path: string, data: object) => Promise<void>
  ): Promise<{ synced: number; failed: number }> {
    const queue = await offlineQueue.getAll();
    let synced = 0, failed = 0;
    for (const item of queue) {
      try {
        await postFn('/api/attendance/submit', {
          teacherId:      item.teacherId,
          subject:        item.subject,
          classNames:     item.classNames,
          periods:        item.periods,
          topic:          item.topic,
          gpsCoordinates: item.gpsCoordinates,
          locationName:   item.locationName,
          imageBase64:    item.imageBase64,
          photoSizeKb:    item.photoSizeKb,
        });
        await offlineQueue.remove(item.id);
        synced++;
      } catch {
        failed++;
        break; // stop on first failure; retry next time
      }
    }
    return { synced, failed };
  },
};
