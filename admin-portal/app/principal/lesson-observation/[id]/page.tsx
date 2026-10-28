'use client';
import { useParams } from 'next/navigation';
import { principalApi } from '@/lib/principal-api';
import ObservationDetail from '@/components/lesson-observation/ObservationDetail';

export default function PrincipalLessonObservationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <ObservationDetail apiClient={principalApi} backHref="/principal/lesson-observation" observationId={id} />;
}
