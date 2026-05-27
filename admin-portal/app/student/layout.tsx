import { ReactNode } from 'react';
import StudentShell from './StudentShell';

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <StudentShell>{children}</StudentShell>;
}
