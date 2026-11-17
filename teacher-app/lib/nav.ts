// One header style for every stack in the app, following the theme.
import type { Colors } from '@/constants/colors';
type ColorSet = typeof Colors;

export const headerOptions = (C: ColorSet) => ({
  headerStyle: { backgroundColor: C.surface },
  headerTintColor: C.text,
  headerTitleStyle: { fontWeight: '700' as const },
  headerShadowVisible: false,
  headerBackTitle: 'Back',
  contentStyle: { backgroundColor: C.bg },
});
