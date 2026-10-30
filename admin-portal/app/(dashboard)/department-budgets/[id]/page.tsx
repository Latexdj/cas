'use client';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import BudgetDetail from '@/components/department-budgets/BudgetDetail';

export default function DepartmentBudgetDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <BudgetDetail apiClient={api} backHref="/department-budgets" budgetId={id} canReview />;
}
