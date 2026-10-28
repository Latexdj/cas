'use client';
import { useParams } from 'next/navigation';
import { teacherApi } from '@/lib/teacher-api';
import ObservationDetail from '@/components/lesson-observation/ObservationDetail';

export default function HodObservationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <ObservationDetail apiClient={teacherApi} backHref="/teacher/hod/observations" observationId={id} />;
}
