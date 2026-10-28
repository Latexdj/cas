'use client';
import { teacherApi } from '@/lib/teacher-api';
import MyObservations from '@/components/lesson-observation/MyObservations';

export default function MyObservationsPage() {
  return <MyObservations apiClient={teacherApi} basePath="/teacher/observations" />;
}
