'use client';
import { teacherApi } from '@/lib/teacher-api';
import ObservationWorkspace from '@/components/lesson-observation/ObservationWorkspace';

export default function HodObservationsPage() {
  return <div className="px-4 pt-6 md:px-6"><ObservationWorkspace apiClient={teacherApi} basePath="/teacher/hod/observations" /></div>;
}
