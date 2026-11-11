'use client';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { BulkIssuePanel } from '@/components/inventory/BulkIssuePanel';

export default function BulkIssuePage() {
  const router = useRouter();
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Bulk Issue</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Issue an item to a whole class, year group or set of teachers in one go, such as exercise books, sanitary pads or test books.
        </p>
      </div>
      <BulkIssuePanel apiClient={api} onIssued={id => router.push(`/inventory/issue-records?id=${id}`)} />
    </div>
  );
}
