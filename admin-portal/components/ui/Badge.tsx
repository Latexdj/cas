const palette: Record<string, string> = {
  present:              'bg-green-100 text-green-700',
  Verified:             'bg-green-100 text-green-700',
  'Made Up':            'bg-green-100 text-green-700',
  Completed:            'bg-green-100 text-green-700',
  Active:               'bg-green-100 text-green-700',
  upcoming:             'bg-blue-100 text-blue-700',
  Scheduled:            'bg-blue-100 text-blue-700',
  in_session:           'bg-yellow-100 text-yellow-700',
  'Remedial Scheduled': 'bg-yellow-100 text-yellow-700',
  Absent:               'bg-red-100 text-red-700',
  Cancelled:            'bg-gray-100 text-gray-500',
  Cleared:              'bg-gray-100 text-gray-500',
  Inactive:             'bg-gray-100 text-gray-500',
  absent:               'bg-red-100 text-red-700',
};

export function Badge({ status }: { status: string }) {
  const cls = palette[status] ?? 'bg-gray-100 text-gray-500';
  const label = status === 'in_session' ? 'In Session' : status;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}
