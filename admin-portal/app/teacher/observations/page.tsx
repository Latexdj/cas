'use client';
import { teacherApi } from '@/lib/teacher-api';
import MyObservations from '@/components/lesson-observation/MyObservations';

export default function MyObservationsPage() {
  return <div className="px-4 pt-6 md:px-6"><MyObservations apiClient={teacherApi} basePath="/teacher/observations" /></div>;
}
