import { ReactNode } from 'react';
import PrincipalShell from './PrincipalShell';

export default function PrincipalLayout({ children }: { children: ReactNode }) {
  return <PrincipalShell>{children}</PrincipalShell>;
}
