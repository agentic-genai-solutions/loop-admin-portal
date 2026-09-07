'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetchWithRetry } from '@/lib/api';

type RoleOption = {
  _id?: string;
  roleCode: string;
  label: string;
  includeInRoleAccessMatrix?: boolean;
  canLoginToAdminPortal?: boolean;
  canViewDeletedUserRecords?: boolean;
  sidebarMenuIds?: string[];
  pageAccessIds?: string[];
  featureAccessIds?: string[];
  profileFieldIds?: string[];
};

type AccessRule = {
  roleId?: string;
  roleCode: string;
  canLoginToAdminPortal: boolean;
  canViewDeletedUserRecords: boolean;
  sidebarMenuIds: string[];
  pageAccessIds: string[];
  featureAccessIds: string[];
  profileFieldIds: string[];
};

const sidebarMenuOptions = [
  { id: 'menu-dashboard', label: 'Dashboard' },
  { id: 'menu-directors', label: 'Directors' },
  { id: 'menu-incentives', label: 'Incentives' },
  { id: 'menu-reports', label: 'Reports' },
  { id: 'menu-store-management', label: 'Store Management' },
  { id: 'menu-finance', label: 'Finance' },
  { id: 'menu-master-data', label: 'Master Data' },
  { id: 'menu-onboarding', label: 'Onboarding' },
  { id: 'menu-workflow', label: 'Workflow' },
];

const pageAccessOptions = [
  { id: 'page-dashboard', label: 'Dashboard' },
  { id: 'page-users', label: 'Users' },
  { id: 'page-employees', label: 'Employees' },
  { id: 'page-directors', label: 'Directors' },
  { id: 'page-onboarding', label: 'Onboarding' },
  { id: 'page-workflow', label: 'Workflow' },
  { id: 'page-reports', label: 'Reports' },
  { id: 'page-stores', label: 'Stores' },
  { id: 'page-finance', label: 'Finance' },
  { id: 'page-master-data-roles', label: 'Master Data - Roles' },
  { id: 'page-master-data-designations', label: 'Master Data - Designations' },
  { id: 'page-access-delegation', label: 'Access Delegation' },
];

const featureOptions = [
  { id: 'feature-login-admin-portal', label: 'Login to admin portal' },
  { id: 'feature-create-user', label: 'Create user' },
  { id: 'feature-edit-user', label: 'Edit user' },
  { id: 'feature-delete-user', label: 'Delete user' },
  { id: 'feature-view-storewise-employees', label: 'View store-wise employees' },
  { id: 'feature-manage-roles', label: 'Manage roles' },
  { id: 'feature-manage-designations', label: 'Manage designations' },
  { id: 'feature-view-reports', label: 'View reports' },
  { id: 'feature-approve-onboarding', label: 'Approve onboarding' },
  { id: 'feature-manage-stores', label: 'Manage stores' },
  { id: 'feature-reset-password', label: 'Reset password' },
  { id: 'feature-review-profile-card', label: 'Review profile card' },
];

const profileFieldOptions = [
  { id: 'field-email', label: 'Email' },
  { id: 'field-mobile', label: 'Mobile' },
  { id: 'field-country-code', label: 'Country code' },
  { id: 'field-gender', label: 'Gender' },
  { id: 'field-blood-group', label: 'Blood group' },
  { id: 'field-date-of-birth', label: 'Date of birth' },
  { id: 'field-designation', label: 'Designation' },
  { id: 'field-store', label: 'Store' },
  { id: 'field-joined-date', label: 'Joined date' },
  { id: 'field-profile-image', label: 'Profile image' },
];

const fallbackRoles: RoleOption[] = [
  { roleCode: 'super_admin', label: 'System Administrator' },
  { roleCode: 'director', label: 'Director' },
  { roleCode: 'hr_manager', label: 'HR Manager' },
  { roleCode: 'store_admin', label: 'Store Admin' },
  { roleCode: 'store_manager', label: 'Store Manager' },
  { roleCode: 'operations_manager', label: 'Operations Manager' },
  { roleCode: 'warehouse_manager', label: 'Warehouse Manager' },
  { roleCode: 'finance_manager', label: 'Finance Manager' },
  { roleCode: 'staff_member', label: 'Staff Member' },
];

const defaultRule = (roleCode: string, label: string): AccessRule => ({
  roleCode,
  canLoginToAdminPortal: roleCode === 'super_admin' || roleCode === 'director',
  canViewDeletedUserRecords: roleCode === 'super_admin' || roleCode === 'super_admin_it',
  sidebarMenuIds: roleCode === 'super_admin' ? sidebarMenuOptions.map((item) => item.id) : ['menu-dashboard'],
  pageAccessIds: roleCode === 'super_admin' ? pageAccessOptions.map((item) => item.id) : ['page-dashboard'],
  featureAccessIds: roleCode === 'super_admin' ? featureOptions.map((item) => item.id) : ['feature-login-admin-portal'],
  profileFieldIds: roleCode === 'super_admin' ? profileFieldOptions.map((item) => item.id) : ['field-email', 'field-designation'],
});

const buildRuleFromRole = (role: RoleOption): AccessRule => ({
  roleId: role._id,
  roleCode: role.roleCode,
  canLoginToAdminPortal: Boolean(role.canLoginToAdminPortal ?? (role.roleCode === 'super_admin' || role.roleCode === 'director')),
  canViewDeletedUserRecords: Boolean(role.canViewDeletedUserRecords ?? (role.roleCode === 'super_admin' || role.roleCode === 'super_admin_it')),
  sidebarMenuIds: Array.isArray(role.sidebarMenuIds) && role.sidebarMenuIds.length > 0 ? role.sidebarMenuIds : defaultRule(role.roleCode, role.label).sidebarMenuIds,
  pageAccessIds: Array.isArray(role.pageAccessIds) && role.pageAccessIds.length > 0 ? role.pageAccessIds : defaultRule(role.roleCode, role.label).pageAccessIds,
  featureAccessIds: Array.isArray(role.featureAccessIds) && role.featureAccessIds.length > 0 ? role.featureAccessIds : defaultRule(role.roleCode, role.label).featureAccessIds,
  profileFieldIds: Array.isArray(role.profileFieldIds) && role.profileFieldIds.length > 0 ? role.profileFieldIds : defaultRule(role.roleCode, role.label).profileFieldIds,
});

export default function AccessDelegationPage() {
  const [roles, setRoles] = useState<RoleOption[]>(fallbackRoles);
  const [selectedRole, setSelectedRole] = useState('super_admin');
  const [rules, setRules] = useState<Record<string, AccessRule>>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const fetched = await apiFetchWithRetry<RoleOption[]>('/master-data/roles').catch(() => []);
        const normalized = Array.isArray(fetched) && fetched.length > 0 ? fetched : fallbackRoles;

        const mergedRoles = normalized
          .filter((role) => role && (role.includeInRoleAccessMatrix ?? true))
          .map((role) => ({
            _id: role._id,
            roleCode: role.roleCode,
            label: role.label,
            canLoginToAdminPortal: role.canLoginToAdminPortal,
            canViewDeletedUserRecords: role.canViewDeletedUserRecords,
            sidebarMenuIds: role.sidebarMenuIds,
            pageAccessIds: role.pageAccessIds,
            featureAccessIds: role.featureAccessIds,
            profileFieldIds: role.profileFieldIds,
          }));

        setRoles(mergedRoles);

        const nextRules = Object.fromEntries(
          mergedRoles.map((role) => [role.roleCode, buildRuleFromRole(role)]),
        );

        setRules(nextRules);
      } catch {
        setRoles(fallbackRoles);
        setRules(Object.fromEntries(fallbackRoles.map((role) => [role.roleCode, defaultRule(role.roleCode, role.label)])));
      } finally {
        setLoading(false);
      }
    };

    void loadRoles();
  }, []);

  const activeRule = useMemo(() => {
    return rules[selectedRole] ?? defaultRule(selectedRole, selectedRole.replace(/_/g, ' '));
  }, [rules, selectedRole]);

  const activeRole = useMemo(() => roles.find((role) => role.roleCode === selectedRole), [roles, selectedRole]);

  const updateRule = (patch: Partial<AccessRule>) => {
    setSaveStatus('idle');
    setRules((current) => ({
      ...current,
      [selectedRole]: {
        ...defaultRule(selectedRole, selectedRole.replace(/_/g, ' ')),
        ...current[selectedRole],
        ...patch,
      },
    }));
  };

  const handleSave = async () => {
    try {
      if (!activeRole?._id) {
        throw new Error('Selected role is missing a role id');
      }

      const payload = {
        includeInRoleAccessMatrix: true,
        canLoginToAdminPortal: Boolean(activeRule.canLoginToAdminPortal),
        canViewDeletedUserRecords: Boolean(activeRule.canViewDeletedUserRecords),
        sidebarMenuIds: activeRule.sidebarMenuIds ?? [],
        pageAccessIds: activeRule.pageAccessIds ?? [],
        featureAccessIds: activeRule.featureAccessIds ?? [],
        profileFieldIds: activeRule.profileFieldIds ?? [],
      };

      await apiFetchWithRetry(`/master-data/access-delegation/${activeRole._id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setRules((current) => ({
        ...current,
        [selectedRole]: {
          ...(current[selectedRole] ?? activeRule),
          ...payload,
          roleId: activeRole._id,
          roleCode: selectedRole,
        },
      }));
      setSaveStatus('saved');
    } catch {
      setSaveStatus('idle');
    }
  };

  const toggleListValue = (key: 'sidebarMenuIds' | 'pageAccessIds' | 'featureAccessIds' | 'profileFieldIds', value: string) => {
    const current = activeRule[key] ?? [];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];

    updateRule({ [key]: next } as Partial<AccessRule>);
  };

  const selectAllForSection = (key: 'sidebarMenuIds' | 'pageAccessIds' | 'featureAccessIds' | 'profileFieldIds', options: { id: string }[]) => {
    updateRule({ [key]: options.map((option) => option.id) } as Partial<AccessRule>);
  };

  const clearAllForSection = (key: 'sidebarMenuIds' | 'pageAccessIds' | 'featureAccessIds' | 'profileFieldIds') => {
    updateRule({ [key]: [] } as Partial<AccessRule>);
  };

  const sectionCardStyle = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.04)',
  } as const;

  const secondaryActionStyle = {
    background: '#f8fafc',
    color: '#0f172a',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    borderRadius: 10,
    padding: '8px 12px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  } as const;

  const toggleRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(248, 250, 252, 0.7)',
  } as const;

  return (
    <main className="portal-page">
      <div style={{ display: 'grid', gap: 20 }}>
        <div style={{ ...sectionCardStyle, display: 'grid', gap: 18 }}>
          <div>
            <p style={{ margin: 0, color: '#475569', fontSize: 14, letterSpacing: '-0.01em' }}>
              Choose a role to configure login access, navigation visibility, feature access, and profile fields.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {roles.map((role) => (
              <button
                key={role.roleCode}
                type="button"
                onClick={() => setSelectedRole(role.roleCode)}
                style={{
                  padding: '12px 18px',
                  borderRadius: 12,
                  border: selectedRole === role.roleCode ? '1px solid rgba(15, 23, 42, 0.6)' : '1px solid rgba(148, 163, 184, 0.22)',
                  background: selectedRole === role.roleCode ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : '#f8fafc',
                  color: selectedRole === role.roleCode ? '#fff' : '#0f172a',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: selectedRole === role.roleCode ? '0 10px 22px rgba(15, 23, 42, 0.16)' : 'none',
                }}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
          <div style={sectionCardStyle}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={toggleRowStyle}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>Allow login to admin portal</span>
                <input
                  type="checkbox"
                  checked={Boolean(activeRule.canLoginToAdminPortal)}
                  onChange={(event) => updateRule({ canLoginToAdminPortal: event.target.checked })}
                  style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                />
              </div>

              <div style={toggleRowStyle}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>Can view soft deleted user records</span>
                <input
                  type="checkbox"
                  checked={Boolean(activeRule.canViewDeletedUserRecords)}
                  onChange={(event) => updateRule({ canViewDeletedUserRecords: event.target.checked })}
                  style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                />
              </div>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => selectAllForSection('sidebarMenuIds', sidebarMenuOptions)} style={secondaryActionStyle}>Select all</button>
                <button type="button" onClick={() => clearAllForSection('sidebarMenuIds')} style={{ ...secondaryActionStyle, background: '#fff' }}>Clear</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {sidebarMenuOptions.map((item) => (
                <label key={item.id} style={{ ...toggleRowStyle, padding: '9px 12px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={(activeRule.sidebarMenuIds ?? []).includes(item.id)}
                    onChange={() => toggleListValue('sidebarMenuIds', item.id)}
                    style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
          <div style={sectionCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => selectAllForSection('pageAccessIds', pageAccessOptions)} style={secondaryActionStyle}>Select all</button>
                <button type="button" onClick={() => clearAllForSection('pageAccessIds')} style={{ ...secondaryActionStyle, background: '#fff' }}>Clear</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {pageAccessOptions.map((item) => (
                <label key={item.id} style={{ ...toggleRowStyle, padding: '9px 12px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={(activeRule.pageAccessIds ?? []).includes(item.id)}
                    onChange={() => toggleListValue('pageAccessIds', item.id)}
                    style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => selectAllForSection('featureAccessIds', featureOptions)} style={secondaryActionStyle}>Select all</button>
                <button type="button" onClick={() => clearAllForSection('featureAccessIds')} style={{ ...secondaryActionStyle, background: '#fff' }}>Clear</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {featureOptions.map((item) => (
                <label key={item.id} style={{ ...toggleRowStyle, padding: '9px 12px' }}>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={(activeRule.featureAccessIds ?? []).includes(item.id)}
                    onChange={() => toggleListValue('featureAccessIds', item.id)}
                    style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...sectionCardStyle, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>Choose which profile sections and values are visible in the user profile card for this role.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => selectAllForSection('profileFieldIds', profileFieldOptions)} style={secondaryActionStyle}>Select all</button>
              <button type="button" onClick={() => clearAllForSection('profileFieldIds')} style={{ ...secondaryActionStyle, background: '#fff' }}>Clear</button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {profileFieldOptions.map((item) => (
              <label key={item.id} style={{ ...toggleRowStyle, padding: '9px 12px' }}>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>{item.label}</span>
                <input
                  type="checkbox"
                  checked={(activeRule.profileFieldIds ?? []).includes(item.id)}
                  onChange={() => toggleListValue('profileFieldIds', item.id)}
                  style={{ width: 18, height: 18, accentColor: '#3b82f6' }}
                />
              </label>
            ))}
          </div>
        </div>

        <div style={{ ...sectionCardStyle, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ color: '#334155', fontWeight: 700 }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>Current role:</span> {roles.find((role) => role.roleCode === selectedRole)?.label ?? selectedRole}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {saveStatus === 'saved' && (
              <span style={{ color: '#15803d', fontSize: 13, fontWeight: 700 }}>Saved locally</span>
            )}
            <button
              type="button"
              onClick={handleSave}
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 16px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 10px 22px rgba(124, 58, 237, 0.2)',
              }}
            >
              Save access rules
            </button>
            <button
              type="button"
              onClick={() => {
                const next = { ...rules };
                next[selectedRole] = defaultRule(selectedRole, roles.find((role) => role.roleCode === selectedRole)?.label ?? selectedRole);
                setRules(next);
                setSaveStatus('idle');
              }}
              style={{
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 16px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Reset role access
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
