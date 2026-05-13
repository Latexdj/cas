import { ReactNode } from 'react';
import TeacherShell from './TeacherShell';

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
