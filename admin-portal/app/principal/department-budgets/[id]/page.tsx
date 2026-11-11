'use client';
import { useParams } from 'next/navigation';
import { principalApi } from '@/lib/principal-api';
import BudgetDetail from '@/components/department-budgets/BudgetDetail';

export default function PrincipalDepartmentBudgetDetailPage() {
  const params = useParams();
  return <BudgetDetail apiClient={principalApi} backHref="/principal/department-budgets" budgetId={params.id as string} />;
}
