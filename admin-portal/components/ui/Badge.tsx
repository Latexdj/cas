const palette: Record<string, { bg: string; text: string; dot: string }> = {
  present:              { bg: '#F0FDF4', text: '#16A34A', dot: '#16A34A' },
  Verified:             { bg: '#F0FDF4', text: '#16A34A', dot: '#16A34A' },
  'Made Up':            { bg: '#F0FDF4', text: '#16A34A', dot: '#16A34A' },
  Completed:            { bg: '#F0FDF4', text: '#16A34A', dot: '#16A34A' },
  Active:               { bg: '#F0FDF4', text: '#16A34A', dot: '#16A34A' },
  upcoming:             { bg: '#EFF6FF', text: '#2563EB', dot: '#2563EB' },
  Scheduled:            { bg: '#EFF6FF', text: '#2563EB', dot: '#2563EB' },
  in_session:           { bg: '#FFFBEB', text: '#D97706', dot: '#D97706' },
  'Remedial Scheduled': { bg: '#FFFBEB', text: '#D97706', dot: '#D97706' },
  Absent:               { bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626' },
  absent:               { bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626' },
  Excused:              { bg: '#F5F3FF', text: '#7C3AED', dot: '#7C3AED' },
  Cancelled:            { bg: '#F8FAFC', text: '#94A3B8', dot: '#CBD5E1' },
  Cleared:              { bg: '#F8FAFC', text: '#94A3B8', dot: '#CBD5E1' },
  Inactive:             { bg: '#F8FAFC', text: '#94A3B8', dot: '#CBD5E1' },
};

export function Badge({ status }: { status: string }) {
  const cfg = palette[status] ?? { bg: '#F8FAFC', text: '#64748B', dot: '#CBD5E1' };
  const label = status === 'in_session' ? 'In Session' : status;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {label}
    </span>
  );
}
