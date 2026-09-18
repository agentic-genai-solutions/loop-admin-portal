'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MasterDataWorkspace from '@/components/master-data/MasterDataWorkspace';
import admin from '@/components/admin/admin.module.css';
import master from '@/components/master-data/master-data.module.css';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';

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
  sidebarMenuIds: Array.isArray(role.sidebarMenuIds) ? role.sidebarMenuIds : defaultRule(role.roleCode, role.label).sidebarMenuIds,
  pageAccessIds: Array.isArray(role.pageAccessIds) ? role.pageAccessIds : defaultRule(role.roleCode, role.label).pageAccessIds,
  featureAccessIds: Array.isArray(role.featureAccessIds) ? role.featureAccessIds : defaultRule(role.roleCode, role.label).featureAccessIds,
  profileFieldIds: Array.isArray(role.profileFieldIds) ? role.profileFieldIds : defaultRule(role.roleCode, role.label).profileFieldIds,
});

type SectionKey = 'sidebarMenuIds' | 'pageAccessIds' | 'featureAccessIds' | 'profileFieldIds';
const sections: { key: SectionKey; title: string; hint: string; options: { id: string; label: string }[] }[] = [
  { key: 'sidebarMenuIds', title: 'Navigation menus', hint: 'Menus visible in the sidebar.', options: sidebarMenuOptions },
  { key: 'pageAccessIds', title: 'Page access', hint: 'Pages available to this role.', options: pageAccessOptions },
  { key: 'featureAccessIds', title: 'Features & actions', hint: 'Actions employees with this role can use.', options: featureOptions },
  { key: 'profileFieldIds', title: 'Profile information', hint: 'Information visible in employee profiles.', options: profileFieldOptions },
];
export default function AccessDelegationPage() {
  const saveLock = useRef(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [rules, setRules] = useState<Record<string, AccessRule>>({});
  const [savedRules, setSavedRules] = useState<Record<string, AccessRule>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const loadRoles = useCallback(async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      const fetched = await apiFetchWithRetry<RoleOption[]>('/master-data/roles');
      const rows = fetched.filter(role => role._id && (role.includeInRoleAccessMatrix ?? true)).sort((a,b) => a.label.localeCompare(b.label));
      const next = Object.fromEntries(rows.map(role => [role.roleCode, buildRuleFromRole(role)]));
      setRoles(rows); setRules(next); setSavedRules(next);
      setSelectedRole(current => rows.some(role => role.roleCode === current) ? current : rows[0]?.roleCode || '');
    } catch { setError('Unable to load access rules. Use Refresh to try again.'); setRoles([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadRoles(); }, [loadRoles]);
  const activeRole = roles.find(role => role.roleCode === selectedRole);
  const activeRule = rules[selectedRole];
  const changed = Boolean(activeRule && JSON.stringify(activeRule) !== JSON.stringify(savedRules[selectedRole]));
  const anyChanges = useMemo(() => Object.keys(rules).some(key => JSON.stringify(rules[key]) !== JSON.stringify(savedRules[key])), [rules,savedRules]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (anyChanges) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [anyChanges]);
  const updateRule = (patch: Partial<AccessRule>) => { setNotice(''); setRules(current => ({...current, [selectedRole]: {...current[selectedRole], ...patch}})); };
  const handleSave = async () => {
    if (saveLock.current || !activeRole?._id || !activeRule) return;
    saveLock.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const payload = {
        includeInRoleAccessMatrix: true,
        canLoginToAdminPortal: activeRule.canLoginToAdminPortal,
        canViewDeletedUserRecords: activeRule.canViewDeletedUserRecords,
        sidebarMenuIds: activeRule.sidebarMenuIds,
        pageAccessIds: activeRule.pageAccessIds,
        featureAccessIds: activeRule.featureAccessIds,
        profileFieldIds: activeRule.profileFieldIds,
      };
      await apiFetch(`/master-data/access-delegation/${activeRole._id}`, { method:'PUT', body:JSON.stringify(payload) });
      setSavedRules(current => ({...current,[selectedRole]: {...activeRule}}));
      setNotice(`Access rules saved for ${activeRole.label}.`);
    } catch { setError('Unable to save access rules. Your changes are kept; please try again.'); }
    finally { saveLock.current = false; setSaving(false); }
  };
  return <MasterDataWorkspace actions={<><button className={admin.secondary} disabled={loading || saving} onClick={() => { if (!anyChanges || window.confirm('Discard unsaved access changes and reload?')) void loadRoles(); }}>Refresh</button><button className={admin.primary} disabled={loading || saving || !changed || !activeRole} onClick={() => void handleSave()}>{saving ? 'Saving…' : 'Save access rules'}</button></>}>
    {error && <p role="alert" className={admin.error}>{error}</p>}{notice && <p role="status" className={admin.notice}>{notice}</p>}
    <section className={admin.panel}><div className={admin.panelHeader}><div><h2>Access delegation</h2><p>Choose a role, review its permissions, then save your changes.</p></div>{changed && <span className={admin.badge}>Unsaved changes</span>}</div>
      <div className={admin.filters}><label>Role<select value={selectedRole} disabled={loading || saving || !roles.length} onChange={e => { setSelectedRole(e.target.value); setNotice(''); }}><option value="" disabled>Choose a role</option>{roles.map(role => <option key={role.roleCode} value={role.roleCode}>{role.label}</option>)}</select></label><input aria-label="Find a permission" placeholder="Find a permission" value={search} onChange={e => setSearch(e.target.value)} /><button className={admin.secondary} disabled={saving || !changed} onClick={() => { setRules(current => ({...current,[selectedRole]:savedRules[selectedRole]})); setNotice(''); }}>Discard changes</button></div>
    </section>
    {loading ? <p className={admin.empty} role="status">Loading access rules…</p> : !activeRole || !activeRule ? <p className={admin.empty}>No roles are available. Add a role and include it in the access matrix to configure permissions.</p> : <fieldset className={master.fieldset} disabled={saving}>
      <section className={admin.panel}><div className={admin.panelHeader}><div><h2>Account access</h2><p>Sign-in and record visibility for {activeRole.label}.</p></div></div><div className={master.permissionGrid}><label className={master.permissionRow}>Allow login to admin portal<input type="checkbox" checked={activeRule.canLoginToAdminPortal} onChange={e => updateRule({canLoginToAdminPortal:e.target.checked})} /></label><label className={master.permissionRow}>View deleted user records<input type="checkbox" checked={activeRule.canViewDeletedUserRecords} onChange={e => updateRule({canViewDeletedUserRecords:e.target.checked})} /></label></div></section>
      <div className={master.permissionGrid}>{sections.map(section => {
        const visible = section.options.filter(option => option.label.toLowerCase().includes(search.toLowerCase()));
        return <section key={section.key} className={admin.panel}><div className={admin.panelHeader}><div><h2>{section.title}</h2><p>{section.hint}</p></div><span className={admin.badge}>{activeRule[section.key].length} selected</span></div><div className={admin.actions} style={{marginBottom:16}}><button type="button" className={admin.link} onClick={() => updateRule({[section.key]: [...new Set([...activeRule[section.key], ...visible.map(option => option.id)])]})}>Select {search ? 'matching' : 'all'}</button><button type="button" className={admin.link} onClick={() => updateRule({[section.key]:activeRule[section.key].filter(id => !visible.some(option => option.id === id))})}>Clear {search ? 'matching' : 'all'}</button></div>{visible.map(option => <label className={master.permissionRow} key={option.id}>{option.label}<input type="checkbox" checked={activeRule[section.key].includes(option.id)} onChange={() => updateRule({[section.key]:activeRule[section.key].includes(option.id) ? activeRule[section.key].filter(id => id !== option.id) : [...activeRule[section.key], option.id]})} /></label>)}{!visible.length && <p className={admin.empty}>No matching permissions.</p>}</section>;
      })}</div>
    </fieldset>}
  </MasterDataWorkspace>;
}
