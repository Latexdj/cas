import PrimaryAdminShell from './PrimaryAdminShell';

export default function PrimaryAdminLayout({ children }: { children: React.ReactNode }) {
  return <PrimaryAdminShell>{children}</PrimaryAdminShell>;
}
