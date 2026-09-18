'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { adminNavigation } from '@/lib/admin-navigation';
import navigationStyles from '@/components/incentives/incentives.module.css';
import styles from './admin.module.css';

export default function AdminWorkspace({ children, actions, className = '' }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  const pathname = usePathname();
  return <main className={`${styles.workspace} ${className}`}>
    <div className={`${navigationStyles.pageToolbar} ${styles.toolbar}`}>
      <nav className={navigationStyles.tabs} aria-label="Admin pages">{adminNavigation.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>{item.label}</Link>)}</nav>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
    {children}
  </main>;
}

export function AdminDialog({ children, title, busy = false, onClose }: { children: ReactNode; title: string; busy?: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    ref.current?.showModal(); document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog className={styles.dialog} ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}
