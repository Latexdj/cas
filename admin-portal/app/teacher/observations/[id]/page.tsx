'use client';
import { useParams } from 'next/navigation';
import { teacherApi } from '@/lib/teacher-api';
import MyObservationDetail from '@/components/lesson-observation/MyObservationDetail';

export default function MyObservationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <div className="px-4 pt-6 md:px-6"><MyObservationDetail apiClient={teacherApi} backHref="/teacher/observations" observationId={id} /></div>;
}
