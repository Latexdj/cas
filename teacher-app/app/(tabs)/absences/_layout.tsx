import { Stack } from 'expo-router';
import { Colors } from '@/constants/colors';

export default function AbsencesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle:      { backgroundColor: Colors.primary },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index"    options={{ title: 'My Absences' }} />
      <Stack.Screen name="remedial" options={{ title: 'Schedule Remedial' }} />
    </Stack>
  );
}
