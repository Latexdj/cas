'use client';
import { principalApi } from '@/lib/principal-api';
import BudgetWorkspace from '@/components/department-budgets/BudgetWorkspace';

export default function PrincipalDepartmentBudgetsPage() {
  return <BudgetWorkspace apiClient={principalApi} basePath="/principal/department-budgets" />;
}
