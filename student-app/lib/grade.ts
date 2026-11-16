export function gradeBadge(pct: number, failLabel: 'Fail' | 'Needs Work' = 'Fail') {
  if (pct >= 80) return { label: 'Excellent', color: '#145C44', bg: '#DCFCE7' };
  if (pct >= 60) return { label: 'Good',      color: '#2D7A4F', bg: '#E4F4EB' };
  if (pct >= 40) return { label: 'Pass',      color: '#C8780A', bg: '#FEF3DC' };
  return { label: failLabel, color: '#B83232', bg: '#FBEAEA' };
}
