'use client';
import { principalApi } from '@/lib/principal-api';
import BudgetsHub from '@/components/department-budgets/BudgetsHub';

export default function PrincipalDepartmentBudgetsPage() {
  return <BudgetsHub apiClient={principalApi} basePath="/principal/department-budgets" />;
}
