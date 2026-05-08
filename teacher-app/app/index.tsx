import { Redirect } from 'expo-router';

// Root index — _layout.tsx handles the real auth redirect via useEffect.
// This file just satisfies Expo Router's requirement for a root route.
export default function Index() {
  return <Redirect href="/login" />;
}
