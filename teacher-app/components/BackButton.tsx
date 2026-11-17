// Back arrow for the first screen of a stack opened from More.
import React from 'react';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

export function BackButton({ fallback = '/(tabs)/more' }: { fallback?: string }) {
  const C = useTheme();
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate(fallback as never))} accessibilityRole="button"
      accessibilityLabel="Back" hitSlop={12} style={{ paddingRight: 16, minHeight: 44, justifyContent: 'center' }}>
      <Ionicons name="arrow-back" size={22} color={C.text} />
    </Pressable>
  );
}
