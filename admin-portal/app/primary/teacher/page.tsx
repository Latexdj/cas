'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PrimaryTeacherRoot() {
  const router = useRouter();
  useEffect(() => { router.replace('/primary/teacher/class'); }, [router]);
  return null;
}
