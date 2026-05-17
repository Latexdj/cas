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
      <Stack.Screen name="index"    options={{ title: 'Absences & Leave' }} />
      <Stack.Screen name="list"     options={{ title: 'Outstanding Absences' }} />
      <Stack.Screen name="remedials" options={{ title: 'Remedial Lessons' }} />
      <Stack.Screen name="leaves"   options={{ title: 'Leave Requests' }} />
      <Stack.Screen name="remedial" options={{ title: 'Schedule Remedial' }} />
    </Stack>
  );
}
