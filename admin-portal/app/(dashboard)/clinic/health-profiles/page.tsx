'use client';
import { api } from '@/lib/api';
import { HealthProfiles } from '@/components/clinic/HealthProfiles';

export default function HealthProfilesPage() {
  return <div className="p-6"><HealthProfiles apiClient={api} /></div>;
}
