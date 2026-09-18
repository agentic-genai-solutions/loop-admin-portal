'use client';

import Link from 'next/link';
import OnboardingWorkspace from '@/components/onboarding/OnboardingWorkspace';
import admin from '@/components/admin/admin.module.css';
import styles from '@/components/onboarding/onboarding.module.css';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { normalizeRole } from '@/lib/utils';

type WorkflowStage = {
  title: string;
  actor: string;
  action: string;
  detail: string;
};

type WorkflowDefinition = {
  label: string;
  summary: {
    stages: number;
    checkpoints: number;
    final: number;
  };
  stages: WorkflowStage[];
};

const roleWorkflows: Record<string, WorkflowDefinition> = {
  'Team Member': {
    label: 'Team Member',
    summary: { stages: 4, checkpoints: 2, final: 1 },
    stages: [
      { title: 'Candidate intake', actor: 'Candidate', action: 'Submits profile and role request', detail: 'The candidate completes onboarding details and shares the required information.' },
      { title: 'Department review', actor: 'Department lead', action: 'Checks role fit and store needs', detail: 'Reporting line, store assignment, and access prerequisites are reviewed.' },
      { title: 'Manager approval', actor: 'Manager', action: 'Approves readiness for onboarding', detail: 'The relevant manager confirms staffing readiness before activation.' },
      { title: 'System activation', actor: 'System admin', action: 'Enables access and permissions', detail: 'Employee access, permissions, and onboarding status are activated.' },
    ],
  },
  'Store Supervisor': {
    label: 'Store Supervisor',
    summary: { stages: 5, checkpoints: 3, final: 1 },
    stages: [
      { title: 'Candidate intake', actor: 'Candidate', action: 'Applies for supervisor role', detail: 'Role profile and store fit are reviewed for supervisor eligibility.' },
      { title: 'Area review', actor: 'Operations team', action: 'Confirms store demand and team coverage', detail: 'Store needs and roster coverage are checked with operations.' },
      { title: 'Manager approval', actor: 'Store manager', action: 'Approves leadership readiness', detail: 'The store manager validates staffing readiness and leadership capability.' },
      { title: 'Director clearance', actor: 'Director', action: 'Checks policy and structure fit', detail: 'The director reviews team structure and compliance requirements.' },
      { title: 'System activation', actor: 'IT / system admin', action: 'Grants supervisor access', detail: 'Supervisor permissions and operational access are activated.' },
    ],
  },
  'Department Manager': {
    label: 'Department Manager',
    summary: { stages: 4, checkpoints: 2, final: 1 },
    stages: [
      { title: 'Profile submission', actor: 'Candidate', action: 'Uploads profile and department details', detail: 'Candidate profile is captured with department and role context.' },
      { title: 'Department review', actor: 'Department head', action: 'Reviews capability and role fit', detail: 'Department head checks capability, reporting, and KPI alignment.' },
      { title: 'Approval gateway', actor: 'Leadership', action: 'Approves hiring or reassignment', detail: 'Leadership validates readiness for this role and department.' },
      { title: 'Access rollout', actor: 'Admin', action: 'Enables department access', detail: 'Department permissions and reporting visibility are activated.' },
    ],
  },
  Finance: {
    label: 'Finance',
    summary: { stages: 5, checkpoints: 3, final: 1 },
    stages: [
      { title: 'Intake review', actor: 'Candidate', action: 'Submits finance onboarding details', detail: 'Candidate details are checked against finance access requirements.' },
      { title: 'Policy validation', actor: 'Finance admin', action: 'Validates compliance and payroll fit', detail: 'Compliance and payroll eligibility are validated before approval.' },
      { title: 'Finance head approval', actor: 'Finance manager', action: 'Approves sensitive access rights', detail: 'Finance manager confirms access to sensitive financial functions.' },
      { title: 'Operations sign-off', actor: 'HR / operations', action: 'Confirms final onboarding setup', detail: 'HR and operations align final onboarding details.' },
      { title: 'System activation', actor: 'System admin', action: 'Activates finance tools and reports', detail: 'Finance tools, reporting, and approvals are enabled.' },
    ],
  },
  Director: {
    label: 'Director',
    summary: { stages: 3, checkpoints: 1, final: 1 },
    stages: [
      { title: 'Leadership intake', actor: 'Candidate', action: 'Applies for leadership access', detail: 'Leadership profile and strategic role intent are reviewed.' },
      { title: 'Executive approval', actor: 'Executive sponsor', action: 'Confirms role assignment', detail: 'Board or executive sponsor confirms the role assignment.' },
      { title: 'Access activation', actor: 'System admin', action: 'Enables director privileges', detail: 'Director privileges, dashboards, and approval rights are enabled.' },
    ],
  },
  'IT Admin': {
    label: 'IT Admin',
    summary: { stages: 4, checkpoints: 2, final: 1 },
    stages: [
      { title: 'Access request', actor: 'Employee', action: 'Requests system and admin access', detail: 'System access request and environment needs are logged.' },
      { title: 'Security review', actor: 'Security / IT', action: 'Validates permission scope', detail: 'Permissions and role scope are validated against policy.' },
      { title: 'Admin approval', actor: 'IT lead', action: 'Approves technical access rights', detail: 'IT lead approves technical access and tooling rights.' },
      { title: 'System activation', actor: 'System admin', action: 'Grants tool access and device rights', detail: 'SaaS, device, and admin tools are granted for production use.' },
    ],
  },
};


export default function WorkflowPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState('Team Member');

  useEffect(() => {
    const storedUser = window.sessionStorage.getItem('loop_admin_user');
    if (!storedUser) {
      router.replace('/login');
      return;
    }

    try {
      const parsed = JSON.parse(storedUser);
      const role = normalizeRole(parsed?.role || 'Team');
      if (!role || role === 'Unknown') {
        router.replace('/login');
      }
    } catch {
      router.replace('/login');
    }
  }, [router]);

  const currentWorkflow = roleWorkflows[selectedRole];

  return <OnboardingWorkspace actions={<Link className={admin.primary} href="/users">Manage users</Link>}>
    <section className={admin.panel}><div className={admin.panelHeader}><div><h2>Onboarding workflow guide</h2><p>Reference steps for each role. This guide does not change approval rules or applicant status.</p></div></div><div className={admin.filters}><label>Role guide<select value={selectedRole} onChange={event => setSelectedRole(event.target.value)}>{Object.keys(roleWorkflows).map(role => <option key={role} value={role}>{role}</option>)}</select></label><span className={admin.badge}>{currentWorkflow.stages.length} steps</span></div></section>
    <section className={admin.panel}><div className={admin.panelHeader}><div><h2>{currentWorkflow.label}</h2><p>Follow the sequence from the initial request to account activation.</p></div></div><ol className={styles.steps}>{currentWorkflow.stages.map((step,index) => <li key={step.title}><span className={styles.number} aria-hidden="true">{index+1}</span><div><h3>{step.title}</h3><strong>{step.action}</strong><p>{step.detail}</p><small>Responsible: {step.actor}</small></div></li>)}</ol></section>
  </OnboardingWorkspace>;
}
