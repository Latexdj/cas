import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

export default function AssessmentsLayout() {
  const Colors = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle:      { backgroundColor: Colors.primary },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index"   options={{ title: 'My Assessments' }} />
      <Stack.Screen name="subject" options={{ title: 'Assessments'    }} />
      <Stack.Screen name="scores"  options={{ title: 'Enter Scores'   }} />
      <Stack.Screen name="exam"    options={{ title: 'Exam Scores'    }} />
    </Stack>
  );
}
