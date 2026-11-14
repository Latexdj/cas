'use client';
import { api } from '@/lib/api';
import { ClinicInventory } from '@/components/clinic/ClinicInventory';

export default function ClinicInventoryPage() {
  return <div className="p-6"><ClinicInventory apiClient={api} /></div>;
}
