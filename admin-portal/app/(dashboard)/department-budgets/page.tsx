'use client';
import { api } from '@/lib/api';
import BudgetsHub from '@/components/department-budgets/BudgetsHub';

export default function DepartmentBudgetsPage() {
  return <BudgetsHub apiClient={api} basePath="/department-budgets" />;
}
