export function gradeBadge(pct: number, failLabel: 'Fail' | 'Needs Work' = 'Fail') {
  if (pct >= 80) return { label: 'Excellent', color: '#145C44', bg: '#DCFCE7' };
  if (pct >= 60) return { label: 'Good',      color: '#1D4ED8', bg: '#DBEAFE' };
  if (pct >= 40) return { label: 'Pass',      color: '#C8780A', bg: '#FEF3DC' };
  return { label: failLabel, color: '#B83232', bg: '#FBEAEA' };
}
