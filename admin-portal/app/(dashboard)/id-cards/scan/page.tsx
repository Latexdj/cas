'use client';
import { api } from '@/lib/api';
import { IdCardScanner } from '@/components/IdCardScanner';

export default function IdCardScanPage() {
  return (
    <div className="p-6 space-y-5 max-w-md">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Scan ID card</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Verify a student's ID card and check their current exeat status</p>
      </div>
      <IdCardScanner apiClient={api} />
    </div>
  );
}
