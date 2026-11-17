import { Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { headerOptions } from '@/lib/nav';

export default function AbsencesLayout() {
  const C = useTheme();
  return (
    <Stack screenOptions={headerOptions(C)}>
      <Stack.Screen name="index"        options={{ title: 'Absences' }} />
      <Stack.Screen name="list"         options={{ title: 'Class absences' }} />
      <Stack.Screen name="meetings"     options={{ title: 'Meeting absences' }} />
      <Stack.Screen name="plc-absences" options={{ title: 'PLC absences' }} />
      <Stack.Screen name="remedials"    options={{ title: 'Remedial lessons' }} />
      <Stack.Screen name="leaves"       options={{ title: 'Leave' }} />
      <Stack.Screen name="remedial"     options={{ title: 'Schedule remedial' }} />
    </Stack>
  );
}
