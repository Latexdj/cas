'use client';
import { principalApi } from '@/lib/principal-api';
import ObservationWorkspace from '@/components/lesson-observation/ObservationWorkspace';

export default function PrincipalLessonObservationPage() {
  return <ObservationWorkspace apiClient={principalApi} basePath="/principal/lesson-observation" />;
}
