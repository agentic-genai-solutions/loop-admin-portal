'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';
import { masterDataNavigation } from '@/lib/master-data-navigation';
import navigation from '@/components/incentives/incentives.module.css';
import admin from '@/components/admin/admin.module.css';
import styles from './master-data.module.css';
export default function MasterDataWorkspace({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname();
  return <main className={`${admin.workspace} ${styles.workspace}`}>
    <div className={`${navigation.pageToolbar} ${admin.toolbar}`}><nav className={navigation.tabs} aria-label="Master Data pages">{masterDataNavigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>{item.label}</Link>)}</nav><div className={admin.actions}>{actions}</div></div>
    {children}
  </main>;
}
