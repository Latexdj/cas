export function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

// Readable text color against a given background hex (basic luminance check).
export function readableOn(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1A1A1A' : '#FFFFFF';
}
