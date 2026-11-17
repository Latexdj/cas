import * as Location from 'expo-location';

// "lat,lng" to six places, as the check-in endpoints expect.
export async function getGps(): Promise<{ gps: string } | { error: string }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { error: 'Location is off for CAS Teacher. Allow it in phone settings.' };
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { gps: `${loc.coords.latitude.toFixed(6)},${loc.coords.longitude.toFixed(6)}` };
  } catch {
    return { error: 'Could not get your location. Tap Refresh to try again.' };
  }
}
