'use client';

import { api } from '@/lib/api';
import { SubjectAppsManager, LIGHT } from '@/components/teacher-resources/SubjectAppsManager';

export default function TeacherResourcesAdminPage() {
  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-ink">Teacher Resources</h1>
        <p className="text-sm mt-0.5 text-ink-muted">Subject apps teachers can open from the teacher portal.</p>
      </div>
      <SubjectAppsManager client={api} mode="school" P={LIGHT} />
    </div>
  );
}
