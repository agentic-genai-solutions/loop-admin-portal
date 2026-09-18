'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';
import { workforceNavigation } from '@/lib/workforce-navigation';
import navigation from '@/components/incentives/incentives.module.css';
import admin from '@/components/admin/admin.module.css';
import styles from './workforce.module.css';
export default function WorkforceWorkspace({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname();
  return <main className={`${admin.workspace} ${styles.workspace}`}>
    <div className={`${navigation.pageToolbar} ${admin.toolbar}`}>
      <nav className={navigation.tabs} aria-label="Workforce pages">{workforceNavigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>{item.label}</Link>)}</nav>
      <div className={admin.actions}>{actions}</div>
    </div>{children}
  </main>;
}
