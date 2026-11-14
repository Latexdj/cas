'use client';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ClinicVisitDetail } from '@/components/clinic/ClinicVisitDetail';

export default function ClinicVisitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <div className="p-6"><ClinicVisitDetail apiClient={api} visitId={id} onBack={() => router.push('/clinic/visits')} canReopen /></div>;
}
