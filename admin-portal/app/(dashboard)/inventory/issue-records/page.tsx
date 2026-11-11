'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { IssueRecordsPanel } from '@/components/inventory/IssueRecordsPanel';

function IssueRecordsInner() {
  const id = useSearchParams().get('id');
  return <IssueRecordsPanel apiClient={api} initialBatchId={id} />;
}

export default function IssueRecordsPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Issue Records</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Every bulk issue, with its signed sheet attached for audit.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <IssueRecordsInner />
      </Suspense>
    </div>
  );
}
