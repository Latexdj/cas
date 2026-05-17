import React, { useCallback, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function NotificationsScreen() {
  const Colors = useTheme();
  const [items,      setItems]      = useState<Notification[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Notification[]>('/api/notifications');
      setItems(data ?? []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  async function markAllRead() {
    await api.patch('/api/notifications/read-all', {});
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await api.patch(`/api/notifications/${id}/read`, {});
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  const unread = items.filter(n => !n.read).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.heading}>Notifications</Text>
          <Text style={styles.sub}>{unread > 0 ? `${unread} unread` : 'All caught up'}</Text>
        </View>
        {unread > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Text style={[styles.markAllText, { color: Colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySub}>You'll see system messages here when they arrive.</Text>
        </View>
      ) : (
        items.map(n => (
          <View
            key={n.id}
            style={[
              styles.card,
              !n.read && { borderColor: '#FCA5A5', backgroundColor: '#FFF8F8' },
            ]}
          >
            <View style={styles.cardBody}>
              <View style={styles.flex1}>
                <View style={styles.titleRow}>
                  {!n.read && <View style={styles.dot} />}
                  <Text style={styles.title} numberOfLines={2}>{n.title}</Text>
                </View>
                <Text style={styles.message}>{n.message}</Text>
                <Text style={styles.time}>{formatTime(n.created_at)}</Text>
              </View>
              {!n.read && (
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={() => markRead(n.id)}
                >
                  <Text style={styles.dismissText}>Dismiss</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F4EFE6' },
  content:     { padding: 16, paddingBottom: 40 },
  headerRow:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  heading:     { fontSize: 20, fontWeight: '800', color: '#2C2218', letterSpacing: -0.3 },
  sub:         { fontSize: 12, color: '#8C7E6E', marginTop: 2 },
  markAllBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#E4F4EB' },
  markAllText: { fontSize: 12, fontWeight: '700' },
  skeleton:    { backgroundColor: '#E5DDD5', borderRadius: 16, height: 80, marginBottom: 10 },
  empty:       { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 40, alignItems: 'center' },
  emptyIcon:   { fontSize: 36, marginBottom: 10 },
  emptyTitle:  { fontSize: 15, fontWeight: '700', color: '#2C2218' },
  emptySub:    { fontSize: 13, color: '#8C7E6E', marginTop: 4, textAlign: 'center' },
  card:        { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2D9CC', padding: 14, marginBottom: 10 },
  cardBody:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flex1:       { flex: 1 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', flexShrink: 0 },
  title:       { fontSize: 14, fontWeight: '700', color: '#2C2218', flex: 1 },
  message:     { fontSize: 13, color: '#5C4F42', lineHeight: 18, marginBottom: 6 },
  time:        { fontSize: 11, color: '#8C7E6E' },
  dismissBtn:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F4EFE6' },
  dismissText: { fontSize: 11, fontWeight: '700', color: '#8C7E6E' },
});
