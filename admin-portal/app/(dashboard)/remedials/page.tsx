'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RemedialsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/absences?tab=remedials'); }, [router]);
  return null;
}
