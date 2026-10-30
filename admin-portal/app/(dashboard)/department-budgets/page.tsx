'use client';
import { api } from '@/lib/api';
import BudgetWorkspace from '@/components/department-budgets/BudgetWorkspace';

export default function DepartmentBudgetsPage() {
  return <BudgetWorkspace apiClient={api} basePath="/department-budgets" />;
}
