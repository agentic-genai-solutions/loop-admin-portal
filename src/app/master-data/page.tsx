'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MasterDataPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/master-data/roles');
  }, [router]);

  return null;
}
