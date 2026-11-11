'use client';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import BudgetDetail from '@/components/department-budgets/BudgetDetail';

export default function DepartmentBudgetDetailPage() {
  const params = useParams();
  return <BudgetDetail apiClient={api} backHref="/department-budgets" budgetId={params.id as string} />;
}
