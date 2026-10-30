'use client';
import { useParams } from 'next/navigation';
import { teacherApi } from '@/lib/teacher-api';
import BudgetDetail from '@/components/department-budgets/BudgetDetail';

export default function HodBudgetDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <BudgetDetail apiClient={teacherApi} backHref="/teacher/hod/budgets" budgetId={id} canReview={false} />;
}
