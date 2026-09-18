'use client';

import { onboardingNavigation } from '@/lib/onboarding-navigation';
import { masterDataNavigation } from '@/lib/master-data-navigation';
import { workforceNavigation } from '@/lib/workforce-navigation';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { adminNavigation } from '@/lib/admin-navigation';
import { financeNavigation } from '@/lib/finance-navigation';
import { normalizeRole } from '@/lib/utils';

const navItems = adminNavigation;

function resolveDisplayName(parsedUser: Record<string, any> | null | undefined) {
  const directName = [parsedUser?.title, parsedUser?.firstName, parsedUser?.lastName].filter(Boolean).join(' ');
  if (directName) return directName.trim();

  return (
    parsedUser?.name ||
    parsedUser?.fullName ||
    parsedUser?.displayName ||
    parsedUser?.username ||
    parsedUser?.email?.split('@')[0] ||
    'User'
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [userName, setUserName] = useState('User');
  const [userRole, setUserRole] = useState('Team');
  const [userStore, setUserStore] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isIncentivesOpen, setIsIncentivesOpen] = useState(false);
  const [isFinanceOpen, setIsFinanceOpen] = useState(false);
  const [isWorkforceOpen, setIsWorkforceOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isMasterDataOpen, setIsMasterDataOpen] = useState(false);

  const canViewAdmin = true;
  const canViewMasterData = true;
  const canViewWorkforce = true;
  const canViewOnboarding = true;
  const canViewWorkflow = true;
  const canViewDirectors = true;

  useEffect(() => {
    const isCurrentAdminRoute = pathname === '/leave' || pathname === '/employees' || pathname === '/directors' || pathname === '/reports' || pathname === '/stores' || pathname === '/messages';
    setIsAdminOpen(isCurrentAdminRoute || pathname.startsWith('/leave/') || pathname.startsWith('/employees/') || pathname.startsWith('/directors/') || pathname.startsWith('/reports/') || pathname.startsWith('/stores/') || pathname.startsWith('/messages/'));
  }, [pathname]);

  useEffect(() => {
    const isCurrentIncentivesRoute = pathname === '/incentives' || pathname.startsWith('/incentives/');
    setIsIncentivesOpen(isCurrentIncentivesRoute);
  }, [pathname]);

  useEffect(() => {
    setIsFinanceOpen(pathname === '/finance' || pathname.startsWith('/finance/'));
  }, [pathname]);

  useEffect(() => {
    const isCurrentWorkforceRoute = pathname === '/attendance' || pathname === '/roster';
    setIsWorkforceOpen(isCurrentWorkforceRoute || pathname.startsWith('/attendance/') || pathname.startsWith('/roster/'));
  }, [pathname]);

  useEffect(() => {
    const isCurrentOnboardingRoute = pathname === '/onboarding' || pathname === '/users' || pathname === '/workflow';
    setIsOnboardingOpen(isCurrentOnboardingRoute || pathname.startsWith('/onboarding/'));
  }, [pathname]);

  useEffect(() => {
    const isCurrentMasterDataRoute = pathname === '/master-data' || pathname.startsWith('/master-data/');
    setIsMasterDataOpen(isCurrentMasterDataRoute);
  }, [pathname]);

  const visibleNavItems = useMemo(() => navItems, []);

  useEffect(() => {
    const storedUser = window.sessionStorage.getItem('loop_admin_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const resolvedName = resolveDisplayName(parsed);
        const resolvedRole = normalizeRole(parsed?.role || 'Team');
        const resolvedStore = String(parsed?.storeName || parsed?.store || parsed?.storeId || parsed?.department || parsed?.store_name || '').trim();
        setUserName(resolvedName);
        setUserRole(resolvedRole);
        setUserStore(resolvedStore);
      } catch {
        setUserName('User');
        setUserRole('Team');
        setUserStore('');
      }
    }
  }, []);

  const isActiveLink = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem('loop_admin_token');
    window.sessionStorage.removeItem('loop_admin_user');
    window.sessionStorage.removeItem('loop_admin_last_activity');
    router.push('/login');
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="brand-block">
        <div className="brand-mark" aria-label="Loop logo">
          <img src="/loop-logo-white.png" alt="Loop" className="brand-logo-image" />
          <div className="brand-subtitle">Admin portal</div>
        </div>
      </div>

      <button
        type="button"
        className="mobile-menu-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="sidebar-nav"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <span className="hamburger" aria-hidden="true">
          <span className="bar bar-1" />
          <span className="bar bar-2" />
          <span className="bar bar-3" />
        </span>
      </button>

      <nav id="sidebar-nav" className={`sidebar-nav ${isOpen ? 'visible' : ''}`} aria-label="Sidebar navigation">
        <Link
          href="/"
          className={`nav-item ${isActiveLink('/') ? 'active' : ''}`}
          onClick={() => setIsOpen(false)}
        >
          Dashboard
        </Link>

        <div className="nav-group">
          <button
            type="button"
            className={`nav-group-toggle ${isIncentivesOpen ? 'active' : ''}`}
            onClick={() => {
              if (!isIncentivesOpen) {
                router.push('/incentives');
              }
              setIsIncentivesOpen((open) => !open);
              setIsOpen(false);
            }}
            aria-expanded={isIncentivesOpen}
          >
            <span>Incentives</span>
            <span className="nav-group-caret">{isIncentivesOpen ? '▾' : '▸'}</span>
          </button>

          {isIncentivesOpen && (
            <div className="nav-group-children">
              <Link
                href="/incentives"
                className={`nav-item nav-item-sub ${pathname === '/incentives' ? 'active' : ''}`}
                onClick={() => setIsOpen(false)}
              >
                Overview
              </Link>
              <Link href="/incentives/programs" className={`nav-item nav-item-sub ${isActiveLink('/incentives/programs') ? 'active' : ''}`} onClick={() => setIsOpen(false)}>Programs</Link>
              <Link href="/incentives/entries" className={`nav-item nav-item-sub ${isActiveLink('/incentives/entries') ? 'active' : ''}`} onClick={() => setIsOpen(false)}>Staff Entries</Link>
            </div>
          )}
        </div>

        <div className="nav-group">
          <button type="button" className={`nav-group-toggle ${isActiveLink('/finance') ? 'active' : ''}`}
            onClick={() => {
              if (!isFinanceOpen && !isActiveLink('/finance')) router.push('/finance');
              setIsFinanceOpen(open => !open);
            }} aria-expanded={isFinanceOpen} aria-controls="finance-submenu">
            <span>Finance</span><span className="nav-group-caret" aria-hidden="true">{isFinanceOpen ? '▾' : '▸'}</span>
          </button>
          {isFinanceOpen && <div id="finance-submenu" className="nav-group-children">
            {financeNavigation.map(item => <Link key={item.href} href={item.href}
              className={`nav-item nav-item-sub ${pathname === item.href ? 'active' : ''}`}
              aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setIsOpen(false)}>{item.label}</Link>)}
          </div>}
        </div>

        {canViewAdmin && (
          <div className="nav-group">
            <button
              type="button"
              className={`nav-group-toggle ${isAdminOpen ? 'active' : ''}`}
              onClick={() => {
                if (!isAdminOpen) {
                  router.push('/leave');
                }
                setIsAdminOpen((open) => !open);
                setIsOpen(false);
              }}
              aria-expanded={isAdminOpen}
            >
              <span>Admin</span>
              <span className="nav-group-caret">{isAdminOpen ? '▾' : '▸'}</span>
            </button>

            {isAdminOpen && (
              <div className="nav-group-children">
                {visibleNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item nav-item-sub ${isActiveLink(item.href) ? 'active' : ''}`}
                    aria-current={isActiveLink(item.href) ? 'page' : undefined}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {canViewWorkforce && (
          <div className="nav-group">
            <button
              type="button"
              className={`nav-group-toggle ${isActiveLink('/attendance') || isActiveLink('/roster') ? 'active' : ''}`}
              onClick={() => {
                if (!isWorkforceOpen) {
                  router.push('/attendance');
                }
                setIsWorkforceOpen((open) => !open);
                setIsOpen(false);
              }}
              aria-expanded={isWorkforceOpen}
            >
              <span>Workforce</span>
              <span className="nav-group-caret">{isWorkforceOpen ? '▾' : '▸'}</span>
            </button>

            {isWorkforceOpen && (
              <div className="nav-group-children">
                {workforceNavigation.map(item => <Link key={item.href} href={item.href} className={`nav-item nav-item-sub ${pathname === item.href ? 'active' : ''}`} aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setIsOpen(false)}>{item.label}</Link>)}
              </div>
            )}
          </div>
        )}

        {canViewMasterData && (
          <div className="nav-group">
            <button
              type="button"
              className={`nav-group-toggle ${pathname.startsWith('/master-data') ? 'active' : ''}`}
              onClick={() => {
                if (!isMasterDataOpen) {
                  router.push('/master-data/roles');
                }
                setIsMasterDataOpen((open) => !open);
                setIsOpen(false);
              }}
              aria-expanded={isMasterDataOpen}
            >
              <span>Master Data</span>
              <span className="nav-group-caret">{isMasterDataOpen ? '▾' : '▸'}</span>
            </button>

            {isMasterDataOpen && (
              <div className="nav-group-children">
                {masterDataNavigation.map(item => <Link key={item.href} href={item.href} className={`nav-item nav-item-sub ${pathname === item.href ? 'active' : ''}`} aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setIsOpen(false)}>{item.label}</Link>)}
              </div>
            )}
          </div>
        )}

        {canViewOnboarding && (
          <div className="nav-group">
            <button
              type="button"
              className={`nav-group-toggle ${isActiveLink('/onboarding') || pathname === '/users' || (pathname === '/workflow' && canViewWorkflow) ? 'active' : ''}`}
              onClick={() => {
                if (!isOnboardingOpen) {
                  router.push('/onboarding');
                }
                setIsOnboardingOpen((open) => !open);
                setIsOpen(false);
              }}
              aria-expanded={isOnboardingOpen}
            >
              <span>Onboarding</span>
              <span className="nav-group-caret">{isOnboardingOpen ? '▾' : '▸'}</span>
            </button>

            {isOnboardingOpen && (
              <div className="nav-group-children">
                {onboardingNavigation.filter(item => item.href !== '/workflow' || canViewWorkflow).map(item => <Link key={item.href} href={item.href} className={`nav-item nav-item-sub ${pathname === item.href ? 'active' : ''}`} aria-current={pathname === item.href ? 'page' : undefined} onClick={() => setIsOpen(false)}>{item.label}</Link>)}
              </div>
            )}
          </div>
        )}
      </nav>

    </aside>
  );
}
