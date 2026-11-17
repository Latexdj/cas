import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { headerOptions } from '@/lib/nav';

export default function AssessmentsLayout() {
  const C = useTheme();
  return (
    <Stack screenOptions={headerOptions(C)}>
      <Stack.Screen name="index"   options={{ title: 'Marks' }} />
      <Stack.Screen name="subject" options={{ title: 'Assessments' }} />
      <Stack.Screen name="scores"  options={{ title: 'Enter scores' }} />
      <Stack.Screen name="exam"    options={{ title: 'Exam scores' }} />
    </Stack>
  );
}
