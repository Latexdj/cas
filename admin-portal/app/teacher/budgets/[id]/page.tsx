'use client';
import { useParams } from 'next/navigation';
import { teacherApi } from '@/lib/teacher-api';
import BudgetDetail from '@/components/department-budgets/BudgetDetail';

export default function TeacherBudgetDetailPage() {
  const params = useParams();
  return <div className="px-4 pt-6 md:px-6"><BudgetDetail apiClient={teacherApi} backHref="/teacher/budgets" budgetId={params.id as string} /></div>;
}
