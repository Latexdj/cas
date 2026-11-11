'use client';
import { teacherApi } from '@/lib/teacher-api';
import BudgetsHub from '@/components/department-budgets/BudgetsHub';

// HODs and teachers who head a budget unit (e.g. Senior Housemaster, Sports).
export default function TeacherBudgetsPage() {
  return <BudgetsHub apiClient={teacherApi} basePath="/teacher/budgets" />;
}
