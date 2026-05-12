'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SubjectsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/curriculum'); }, [router]);
  return null;
}
