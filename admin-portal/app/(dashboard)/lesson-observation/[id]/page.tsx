'use client';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import ObservationDetail from '@/components/lesson-observation/ObservationDetail';

export default function LessonObservationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <ObservationDetail apiClient={api} backHref="/lesson-observation" observationId={id} />;
}
