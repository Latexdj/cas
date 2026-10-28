'use client';
import { useParams } from 'next/navigation';
import { teacherApi } from '@/lib/teacher-api';
import MyObservationDetail from '@/components/lesson-observation/MyObservationDetail';

export default function MyObservationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <MyObservationDetail apiClient={teacherApi} backHref="/teacher/observations" observationId={id} />;
}
