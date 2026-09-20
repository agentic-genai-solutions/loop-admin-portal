'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { adminNavigation } from '@/lib/admin-navigation';
import { workforceNavigation } from '@/lib/workforce-navigation';
import { financeNavigation } from '@/lib/finance-navigation';
import { onboardingNavigation } from '@/lib/onboarding-navigation';
import { masterDataNavigation } from '@/lib/master-data-navigation';

const groups = [
  { id: 'team', label: 'Team management', links: adminNavigation },
  { id: 'attendance', label: 'Attendance & shifts', links: workforceNavigation },
  { id: 'rewards', label: 'Rewards & incentives', links: [
    { href: '/incentives', label: 'Overview' },
    { href: '/incentives/programs', label: 'Reward programs' },
    { href: '/incentives/entries', label: 'Employee rewards' },
  ] },
  { id: 'payroll', label: 'Payroll', links: financeNavigation },
  { id: 'accounts', label: 'Accounts & onboarding', links: onboardingNavigation },
  { id: 'settings', label: 'Settings', links: masterDataNavigation },
];
function matches(path: string, href: string) {
  if (href === '/incentives' || href === '/finance' || href === '/attendance') return path === href;
  return path === href || path.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsOpen(false);
    setExpanded(groups.find(group => group.links.some(link => matches(pathname, link.href)))?.id ?? null);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const media = window.matchMedia('(max-width: 900px)');
    const previous = document.body.style.overflow;
    if (media.matches) document.body.style.overflow = 'hidden';
    const close = () => { setIsOpen(false); toggle.current?.focus(); };
    const resize = () => { if (!media.matches) setIsOpen(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab' || !media.matches) return;
      const elements = Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href], button') ?? []).filter(element => element.getClientRects().length > 0);
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    media.addEventListener('change', resize);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey); media.removeEventListener('change', resize); };
  }, [isOpen]);

  return <aside ref={sidebar} className={`sidebar ${isOpen ? 'open' : ''}`}>
    <div className="sidebar-heading">
      <div className="brand-block"><div className="brand-mark"><img src="/loop-logo-white.png" alt="Loop" className="brand-logo-image" /><div className="brand-subtitle">Admin portal</div></div></div>
      <button ref={toggle} type="button" className="mobile-menu-toggle" onClick={() => setIsOpen(open => !open)} aria-expanded={isOpen} aria-controls="sidebar-nav" aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}>
        <span aria-hidden="true">{isOpen ? '✕' : '☰'}</span><span>{isOpen ? 'Close' : 'Menu'}</span>
      </button>
    </div>
    <nav id="sidebar-nav" className={`sidebar-nav ${isOpen ? 'visible' : ''}`} aria-label="Main navigation">
      <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`} aria-current={pathname === '/' ? 'page' : undefined} onClick={() => setIsOpen(false)}>Home</Link>
      {groups.map(group => {
        const open = expanded === group.id;
        const active = group.links.some(link => matches(pathname, link.href));
        return <div className="nav-group" key={group.id}>
          <button type="button" className={`nav-group-toggle ${active ? 'active' : ''}`} aria-expanded={open} aria-controls={`menu-${group.id}`} onClick={() => setExpanded(open ? null : group.id)}>
            <span>{group.label}</span><span className="nav-group-caret" aria-hidden="true">{open ? '−' : '+'}</span>
          </button>
          {open && <div id={`menu-${group.id}`} className="nav-group-children">{group.links.map(link => <Link key={link.href} href={link.href} className={`nav-item nav-item-sub ${matches(pathname, link.href) ? 'active' : ''}`} aria-current={matches(pathname, link.href) ? 'page' : undefined} onClick={() => setIsOpen(false)}>{link.label}</Link>)}</div>}
        </div>;
      })}
    </nav>
  </aside>;
}
