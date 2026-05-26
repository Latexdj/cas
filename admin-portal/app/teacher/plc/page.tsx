'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlcRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/teacher/meetings'); }, [router]);
  return null;
}
