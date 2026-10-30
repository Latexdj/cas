'use client';
import { teacherApi } from '@/lib/teacher-api';
import BudgetWorkspace from '@/components/department-budgets/BudgetWorkspace';

export default function HodBudgetsPage() {
  return <BudgetWorkspace apiClient={teacherApi} basePath="/teacher/hod/budgets" />;
}
