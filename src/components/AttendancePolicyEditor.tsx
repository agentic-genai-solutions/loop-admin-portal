'use client';

import Link from 'next/link';

export default function AttendancePolicyEditor({ scope, profileId, name }: { scope: 'company' | 'shop' | 'employee'; profileId: string; name: string }) {
  if (!profileId) return null;
  const targetScope = scope === 'company' ? 'enterprise' : scope === 'shop' ? 'store' : 'employee';
  const targetId = scope === 'company' ? 'all' : profileId;
  return <Link className="btn btn-secondary" aria-label={`Attendance limits for ${name}`} href={`/attendance/timing?scope=${targetScope}&targetId=${encodeURIComponent(targetId)}`}>
    {scope === 'company' ? 'Company attendance limits' : 'Attendance limits'}
  </Link>;
}
