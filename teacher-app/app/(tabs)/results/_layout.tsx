import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { headerOptions } from '@/lib/nav';
import { BackButton } from '@/components/BackButton';

export default function ResultsLayout() {
  const C = useTheme();
  return (
    <Stack screenOptions={headerOptions(C)}>
      <Stack.Screen name="index"   options={{ title: 'Results', headerLeft: () => <BackButton /> }} />
      <Stack.Screen name="student" options={{ title: 'Student results' }} />
    </Stack>
  );
}
