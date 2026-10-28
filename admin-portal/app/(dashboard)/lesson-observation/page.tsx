'use client';
import { api } from '@/lib/api';
import ObservationWorkspace from '@/components/lesson-observation/ObservationWorkspace';

export default function LessonObservationPage() {
  return <ObservationWorkspace apiClient={api} basePath="/lesson-observation" />;
}
