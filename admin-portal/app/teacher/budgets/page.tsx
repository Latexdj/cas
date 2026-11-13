'use client';
import { teacherApi } from '@/lib/teacher-api';
import BudgetsHub from '@/components/department-budgets/BudgetsHub';

// HODs and teachers who head a budget unit (e.g. Senior Housemaster, Sports).
export default function TeacherBudgetsPage() {
  return <div className="px-4 pt-6 md:px-6"><BudgetsHub apiClient={teacherApi} basePath="/teacher/budgets" /></div>;
}
