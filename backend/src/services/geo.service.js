// Haversine formula — ported directly from Code.txt calculateDistance()
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// location = row from locations table
function verifyLocation(location, userLat, userLng) {
  if (!location || !location.has_coordinates) {
    return {
      valid: true,
      verified: false,
      distance: 0,
      message: 'Location coordinates not configured',
    };
  }

  const distance = calculateDistance(
    userLat,
    userLng,
    parseFloat(location.latitude),
    parseFloat(location.longitude)
  );
  const inRange = distance <= location.radius_meters;

  return {
    valid: inRange,
    verified: true,
    distance: Math.round(distance),
    message: inRange
      ? `You are in ${location.name} (${Math.round(distance)}m from centre)`
      : `You are ${Math.round(distance)}m away from ${location.name} (max ${location.radius_meters}m allowed)`,
  };
}

// ISO week number — ported from Code.txt getWeekNumber()
function getWeekNumber(date) {
  const d = new Date(date);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + (4 - d.getDay()));
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((thursday - jan4) / 86400000 - 3 + (jan4.getDay() + 6) % 7) / 7
    )
  );
}

// Africa/Accra is UTC+0 year-round (no DST), so new Date() == Accra time.
// Returns 1=Monday … 7=Sunday to match the timetable.day_of_week convention.
function getAccraDayOfWeek() {
  const day = new Date().getDay(); // 0=Sun … 6=Sat
  return day === 0 ? 7 : day;
}

module.exports = { calculateDistance, verifyLocation, getWeekNumber, getAccraDayOfWeek };
