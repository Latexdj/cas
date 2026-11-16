// Shown instead of closing the app when a Past Questions screen hits an
// error. Expo Router uses a route's exported ErrorBoundary.
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export function RouteError({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const C = useTheme();
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' }}>
      <View style={{ gap: 8 }}>
        <Ionicons name="alert-circle-outline" size={36} color={C.danger} />
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>This screen hit a problem</Text>
        <Text style={{ color: C.textSoft, fontSize: 15, lineHeight: 22 }}>
          Your progress is saved. Try again, or go back to Past Questions. If it keeps happening, tell a teacher what you were doing and show them the note below.
        </Text>
      </View>
      <TouchableOpacity accessibilityRole="button" onPress={() => { retry(); }}
        style={{ minHeight: 50, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Try again</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.replace('/past-questions')}
        style={{ minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>Back to Past Questions</Text>
      </TouchableOpacity>
      <Text selectable style={{ color: C.muted, fontSize: 12, fontFamily: 'monospace' }}>{String(error?.message || error).slice(0, 300)}</Text>
    </ScrollView>
  );
}
