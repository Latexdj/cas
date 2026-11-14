'use client';
import { api } from '@/lib/api';
import { ClinicInventoryReport } from '@/components/clinic/ClinicInventoryReport';

export default function ClinicInventoryReportPage() {
  return <div className="p-6"><ClinicInventoryReport apiClient={api} /></div>;
}
