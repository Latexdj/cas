import { redirect } from 'next/navigation';

// Budgets moved to /teacher/budgets so unit heads who aren't HODs can reach them.
export default function HodBudgetsRedirect() {
  redirect('/teacher/budgets');
}
