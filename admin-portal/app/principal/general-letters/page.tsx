'use client';
import { principalApi } from '@/lib/principal-api';
import { GeneralLettersModule } from '@/app/(dashboard)/general-letters/page';

// Full read/write mount of the Correspondence module for the principal
// portal — same list/create/AI-draft/edit/void/approve/print UI the admin
// portal has, via the same backend routes (which already accept a
// management-type token everywhere adminOrManagement is checked), just
// landing pre-filtered on Pending Approval since that's the principal's
// most common reason to be here.
export default function PrincipalGeneralLettersPage() {
  return <GeneralLettersModule apiClient={principalApi} defaultStatusFilter="pending_approval" />;
}
