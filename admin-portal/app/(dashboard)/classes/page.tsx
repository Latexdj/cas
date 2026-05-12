'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClassesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/curriculum?tab=classes'); }, [router]);
  return null;
}
