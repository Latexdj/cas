import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { AttendanceCard } from '@/components/AttendanceCard';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors } from '@/constants/colors';
import { AttendanceRecord } from '@/types/api';

const PAGE_SIZE = 30;

export default function HistoryScreen() {
  const { user }  = useAuth();
  const [records,    setRecords]    = useState<AttendanceRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,    setHasMore]    = useState(true);

  async function fetchPage(offset: number, replace: boolean) {
    if (!user) return;
    try {
      const res = await api.get('/api/attendance/history', { params: { limit: PAGE_SIZE, offset } });
      const data: AttendanceRecord[] = res.data;
      setRecords((prev) => replace ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); setRecords([]); fetchPage(0, true); }, [user]));

  const onRefresh = () => { setRefreshing(true); fetchPage(0, true); };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(records.length, false);
  };

  if (loading) return <Spinner />;

  return (
    <View style={styles.container}>
      <FlatList
        data={records}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <AttendanceCard record={item} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<EmptyState icon="📋" title="No records yet" subtitle="Submitted attendance will appear here." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  list:      { padding: 16, flexGrow: 1 },
});
