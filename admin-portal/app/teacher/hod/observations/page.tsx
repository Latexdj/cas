'use client';
import { teacherApi } from '@/lib/teacher-api';
import ObservationWorkspace from '@/components/lesson-observation/ObservationWorkspace';

export default function HodObservationsPage() {
  return <ObservationWorkspace apiClient={teacherApi} basePath="/teacher/hod/observations" />;
}
