'use client';
import { api } from '@/lib/api';
import { ClinicReports } from '@/components/clinic/ClinicReports';

export default function ClinicReportsPage() {
  return <div className="p-6"><ClinicReports apiClient={api} /></div>;
}
