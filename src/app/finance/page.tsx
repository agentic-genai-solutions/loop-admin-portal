'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { apiFetchWithRetry } from '@/lib/api';

type EmployeeOption = {
  employeeId: string;
  fullName: string;
  storeId: string;
};

type StoreOption = {
  value: string;
  label: string;
};

type SalaryConfig = {
  salaryConfigId: string;
  employeeId: string;
  storeId: string | null;
  baseSalary: number;
  currency: string;
  payoutDay: number;
  payoutMode: 'bank_transfer' | 'cash' | 'upi';
  isActive: boolean;
  updatedAt?: string;
};

type PayrollRow = {
  id: string;
  recordId: string;
  payrollId: string;
  entity: string;
  owner: string;
  status: 'Active' | 'Pending Review' | 'Approved' | 'Paid';
  budget: string;
  bonusSplit: string;
};

type SalaryRunError = {
  employeeId: string;
  message: string;
};

type SalaryRunSummary = {
  salaryRunId: string;
  periodStart: string;
  periodEnd: string;
  storeId: string | null;
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed';
  totalEmployees: number;
  createdPayrollCount: number;
  skippedPayrollCount: number;
  failedPayrollCount: number;
  runErrors?: SalaryRunError[];
  completedAt?: string | null;
};

export default function FinancePage() {
  const financeTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'salaries', label: 'Salaries' },
    { id: 'payroll', label: 'Payroll runs' },
    { id: 'slips', label: 'Salary slips' },
  ] as const;
  const [activeTab, setActiveTab] = useState<(typeof financeTabs)[number]['id']>('overview');

  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState({ openPayrollItems: 0, approvalRate: 0, sundayExtraPay: 0 });
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [salaryConfigs, setSalaryConfigs] = useState<SalaryConfig[]>([]);
  const [salaryRuns, setSalaryRuns] = useState<SalaryRunSummary[]>([]);
  const [selectedRunDetail, setSelectedRunDetail] = useState<SalaryRunSummary | null>(null);
  const [slipRows, setSlipRows] = useState<Array<{ payrollId: string; periodStart: string; periodEnd: string; netSalary: number; status: string; currency?: string }>>([]);
  const [selectedSlip, setSelectedSlip] = useState<any>(null);

  const [salaryForm, setSalaryForm] = useState({
    employeeId: '',
    storeId: '',
    baseSalary: '0',
    currency: 'USD',
    payoutDay: '1',
    payoutMode: 'bank_transfer' as 'bank_transfer' | 'cash' | 'upi',
    notes: '',
  });

  const [payrollRunForm, setPayrollRunForm] = useState({
    periodStart: '',
    periodEnd: '',
    storeId: '',
    defaultBaseSalary: '',
    overtime: '0',
    deductions: '0',
    bonus: '0',
  });

  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [slipEmployeeId, setSlipEmployeeId] = useState('');
  const [sortBy, setSortBy] = useState<'entity' | 'owner' | 'status' | 'budget' | 'bonusSplit'>('entity');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const employeeNameById = useMemo(
    () => new Map(employees.map((employee) => [employee.employeeId, employee.fullName])),
    [employees],
  );

  const loadSalaryConfigs = async () => {
    const configs = await apiFetchWithRetry<SalaryConfig[]>('/accounting/payroll/salary-configs').catch(() => []);
    setSalaryConfigs(Array.isArray(configs) ? configs : []);
  };

  const loadSalaryRuns = async () => {
    const runs = await apiFetchWithRetry<SalaryRunSummary[]>('/accounting/payroll/runs').catch(() => []);
    setSalaryRuns(Array.isArray(runs) ? runs : []);
  };

  const mapPayrollRows = (payrollEntries: Array<{ _id?: string; payrollId?: string; employeeId?: string; status?: string; netSalary?: number; baseSalary?: number; bonus?: number; sundayExtraPay?: number }>) => {
    return Array.isArray(payrollEntries)
      ? payrollEntries.map((entry) => {
          const amount = Number(entry.netSalary ?? entry.baseSalary ?? 0);
          const statusValue = String(entry.status ?? 'draft').toLowerCase();
          const status: PayrollRow['status'] = statusValue === 'approved'
            ? 'Approved'
            : statusValue === 'paid'
              ? 'Paid'
              : statusValue === 'draft'
                ? 'Pending Review'
                : 'Active';
          const totalBonus = Number(entry.bonus ?? 0);
          const sundayBonus = Number(entry.sundayExtraPay ?? 0);
          const manualBonus = Math.max(0, totalBonus - sundayBonus);
          const recordId = String(entry._id ?? '').trim();
          const payrollId = String(entry.payrollId ?? '').trim();

          return {
            id: recordId || payrollId || entry.employeeId || `${entry.employeeId ?? 'payroll'}-${amount}`,
            recordId,
            payrollId,
            entity: entry.employeeId ?? 'Employee',
            owner: entry.employeeId ?? 'Finance Team',
            status,
            budget: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount),
            bonusSplit: `Manual ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(manualBonus)} / Sunday ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(sundayBonus)}`,
          } satisfies PayrollRow;
        })
      : [];
  };

  const reloadPayrollRows = async () => {
    const payrollEntries = await apiFetchWithRetry<Array<{ _id?: string; payrollId?: string; employeeId?: string; status?: string; netSalary?: number; baseSalary?: number; bonus?: number; sundayExtraPay?: number }>>('/director/payroll').catch(() => []);
    setRows(mapPayrollRows(Array.isArray(payrollEntries) ? payrollEntries : []));
  };

  useEffect(() => {
    const loadFinanceData = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const [payrollReport, payrollEntries, employeeEntries, storeEntries, configEntries, runEntries] = await Promise.all([
          apiFetchWithRetry<{ totalPayroll?: number; totalSundayExtraPay?: number; approved?: number; pending?: number; paid?: number }>('/director/reports/payroll'),
          apiFetchWithRetry<Array<{ _id?: string; payrollId?: string; employeeId?: string; status?: string; netSalary?: number; baseSalary?: number; bonus?: number; sundayExtraPay?: number }>>('/director/payroll').catch(() => []),
          apiFetchWithRetry<Array<{ employeeCode?: string; firstName?: string; lastName?: string; storeId?: string }>>('/employees').catch(() => []),
          apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores').catch(() => []),
          apiFetchWithRetry<SalaryConfig[]>('/accounting/payroll/salary-configs').catch(() => []),
          apiFetchWithRetry<SalaryRunSummary[]>('/accounting/payroll/runs').catch(() => []),
        ]);

        const openPayrollItems = payrollReport?.pending ?? 0;
        const approvalRate = payrollReport && (payrollReport.approved ?? 0) + (payrollReport.pending ?? 0) + (payrollReport.paid ?? 0) > 0
          ? Math.round((((payrollReport.approved ?? 0) + (payrollReport.paid ?? 0)) / Math.max((payrollReport.approved ?? 0) + (payrollReport.pending ?? 0) + (payrollReport.paid ?? 0), 1)) * 100)
          : 0;

        const mappedRows = mapPayrollRows(Array.isArray(payrollEntries) ? payrollEntries : []);

        const employeeOptions = Array.isArray(employeeEntries)
          ? employeeEntries
            .map((entry) => {
              const employeeId = String(entry?.employeeCode ?? '').trim();
              if (!employeeId) {
                return null;
              }

              const fullName = `${String(entry?.firstName ?? '').trim()} ${String(entry?.lastName ?? '').trim()}`.trim() || employeeId;
              return {
                employeeId,
                fullName,
                storeId: String(entry?.storeId ?? '').trim(),
              } satisfies EmployeeOption;
            })
            .filter((entry): entry is EmployeeOption => Boolean(entry))
          : [];

        const storeOptions = Array.isArray(storeEntries)
          ? storeEntries
            .map((store) => ({
              value: String(store?._id ?? store?.id ?? '').trim(),
              label: String(store?.name ?? '').trim(),
            }))
            .filter((entry) => entry.value && entry.label)
          : [];

        setSummary({
          openPayrollItems,
          approvalRate,
          sundayExtraPay: Number(payrollReport?.totalSundayExtraPay ?? 0),
        });
        setRows(mappedRows);
        setEmployees(employeeOptions);
        setStores(storeOptions);
        setSalaryConfigs(Array.isArray(configEntries) ? configEntries : []);
        setSalaryRuns(Array.isArray(runEntries) ? runEntries : []);

        const fallbackEmployee = employeeOptions[0]?.employeeId ?? '';
        const fallbackStore = employeeOptions[0]?.storeId ?? '';
        setSalaryForm((current) => ({
          ...current,
          employeeId: current.employeeId || fallbackEmployee,
          storeId: current.storeId || fallbackStore,
        }));
        setSlipEmployeeId((current) => current || fallbackEmployee);
      } catch {
        setSummary({ openPayrollItems: 0, approvalRate: 0, sundayExtraPay: 0 });
        setRows([]);
        setErrorMessage('Unable to load payroll finance data.');
      } finally {
        setIsLoading(false);
      }
    };

    loadFinanceData();
  }, []);

  const formattedRows = useMemo(() => {
    const parseBudget = (value: string) => {
      const numeric = Number(value.replace(/[^0-9.-]+/g, ''));
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    return [...rows].sort((first, second) => {
      const comparison = sortBy === 'budget'
        ? parseBudget(first.budget) - parseBudget(second.budget)
        : sortBy === 'bonusSplit'
          ? parseBudget(first.bonusSplit) - parseBudget(second.bonusSplit)
          : String(first[sortBy]).localeCompare(String(second[sortBy]), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [rows, sortBy, sortDirection]);

  const handleSort = (column: 'entity' | 'owner' | 'status' | 'budget' | 'bonusSplit') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'entity' | 'owner' | 'status' | 'budget' | 'bonusSplit') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleSaveSalaryConfig = async () => {
    setStatusMessage('');
    setErrorMessage('');

    try {
      await apiFetchWithRetry('/accounting/payroll/salary-configs', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: salaryForm.employeeId,
          storeId: salaryForm.storeId || undefined,
          baseSalary: Number(salaryForm.baseSalary),
          currency: salaryForm.currency,
          payoutDay: Number(salaryForm.payoutDay),
          payoutMode: salaryForm.payoutMode,
          notes: salaryForm.notes,
        }),
      });

      await loadSalaryConfigs();
      setStatusMessage('Salary configuration saved successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save salary configuration.');
    }
  };

  const handleGeneratePayroll = async () => {
    setStatusMessage('');
    setErrorMessage('');

    try {
      const result = await apiFetchWithRetry<{ createdPayrollCount?: number; skippedPayrollCount?: number; failedPayrollCount?: number; salaryRunId?: string }>('/accounting/payroll/generate', {
        method: 'POST',
        body: JSON.stringify({
          periodStart: payrollRunForm.periodStart,
          periodEnd: payrollRunForm.periodEnd,
          storeId: payrollRunForm.storeId || undefined,
          defaultBaseSalary: payrollRunForm.defaultBaseSalary ? Number(payrollRunForm.defaultBaseSalary) : undefined,
          overtime: Number(payrollRunForm.overtime || 0),
          deductions: Number(payrollRunForm.deductions || 0),
          bonus: Number(payrollRunForm.bonus || 0),
        }),
      });

      setStatusMessage(
        `Payroll run ${String(result.salaryRunId ?? '').trim() || ''} completed. Created: ${result.createdPayrollCount ?? 0}, Skipped: ${result.skippedPayrollCount ?? 0}, Failed: ${result.failedPayrollCount ?? 0}.`,
      );

      await Promise.all([reloadPayrollRows(), loadSalaryRuns()]);

      if (result.salaryRunId) {
        const runDetail = await apiFetchWithRetry<SalaryRunSummary>(`/accounting/payroll/runs/${encodeURIComponent(result.salaryRunId)}`).catch(() => null);
        setSelectedRunDetail(runDetail);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate payroll run.');
    }
  };

  const handleUpdatePayrollStatus = async (row: PayrollRow, nextStatus: 'approved' | 'paid') => {
    setStatusMessage('');
    setErrorMessage('');

    if (!row.recordId) {
      setErrorMessage('Cannot update status for this payroll row. Missing internal record id.');
      return;
    }

    try {
      await apiFetchWithRetry(`/accounting/payroll/${encodeURIComponent(row.recordId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });

      setRows((currentRows) => currentRows.map((entry) => {
        if (entry.recordId !== row.recordId) {
          return entry;
        }

        return {
          ...entry,
          status: nextStatus === 'approved' ? 'Approved' : 'Paid',
        };
      }));
      setStatusMessage(`Payroll ${row.payrollId || row.recordId} updated to ${nextStatus}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update payroll status.');
    }
  };

  const handleLoadRunDetail = async (salaryRunId: string) => {
    setStatusMessage('');
    setErrorMessage('');

    try {
      const runDetail = await apiFetchWithRetry<SalaryRunSummary>(`/accounting/payroll/runs/${encodeURIComponent(salaryRunId)}`);
      setSelectedRunDetail(runDetail);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load payroll run detail.');
      setSelectedRunDetail(null);
    }
  };

  const handleLoadEmployeeSlips = async () => {
    setStatusMessage('');
    setErrorMessage('');
    setSelectedSlip(null);

    try {
      const payrollRows = await apiFetchWithRetry<Array<{ payrollId?: string; periodStart?: string; periodEnd?: string; netSalary?: number; status?: string; currency?: string }>>(
        `/accounting/payroll/employee/${encodeURIComponent(slipEmployeeId)}`,
      );

      const mapped = (Array.isArray(payrollRows) ? payrollRows : []).map((row) => ({
        payrollId: String(row.payrollId ?? '').trim(),
        periodStart: String(row.periodStart ?? ''),
        periodEnd: String(row.periodEnd ?? ''),
        netSalary: Number(row.netSalary ?? 0),
        status: String(row.status ?? '').trim(),
        currency: String(row.currency ?? 'USD').trim() || 'USD',
      })).filter((row) => row.payrollId);

      setSlipRows(mapped);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load salary slips.');
    }
  };

  const handleLoadSlipDetail = async (payrollId: string) => {
    setStatusMessage('');
    setErrorMessage('');

    try {
      const slip = await apiFetchWithRetry(`/accounting/payroll/${encodeURIComponent(payrollId)}/slip`);
      setSelectedSlip(slip);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load slip detail.');
    }
  };

  return (
    <main className="portal-page">

      {statusMessage && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)', color: '#047857', fontWeight: 700 }}>
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#b91c1c', fontWeight: 700 }}>
          {errorMessage}
        </div>
      )}


      <div className="finance-toolbar">
        <div className="finance-tabs" role="tablist" aria-label="Finance sections">
          {financeTabs.map((tab, index) => <button key={tab.id} id={`finance-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`finance-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % financeTabs.length;
            else if (event.key === 'ArrowLeft') next = (index + financeTabs.length - 1) % financeTabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = financeTabs.length - 1;
            else return;
            event.preventDefault();
            setActiveTab(financeTabs[next].id);
            document.getElementById(`finance-tab-${financeTabs[next].id}`)?.focus();
          }}>{tab.label}</button>)}
        </div>
        <span className="finance-context" role="status">{isLoading ? 'Loading…' : activeTab === 'salaries' ? `${salaryConfigs.length} configured salaries` : activeTab === 'payroll' ? `${salaryRuns.length} payroll runs` : activeTab === 'slips' ? `${employees.length} employees` : `${formattedRows.length} payroll items`}</span>
      </div>
      <section id="finance-panel-overview" role="tabpanel" aria-labelledby="finance-tab-overview" hidden={activeTab !== 'overview'} tabIndex={0}>
      <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 22 }}>
        <div className="card metric-card" style={{ padding: '18px 20px', minHeight: 130 }}>
          <span className="metric-icon" aria-hidden="true">🧾</span>
          <div className="metric-body">
            <span className="metric-title">Open Payroll Items</span>
            <span className="metric-value">{summary.openPayrollItems}</span>
            <span className="metric-meta"><strong className="warning">Needs review</strong></span>
          </div>
        </div>
        <div className="card metric-card" style={{ padding: '18px 20px', minHeight: 130 }}>
          <span className="metric-icon" aria-hidden="true">✅</span>
          <div className="metric-body">
            <span className="metric-title">Approval Rate</span>
            <span className="metric-value">{summary.approvalRate}%</span>
            <span className="metric-meta"><strong className="info">{summary.approvalRate}% approved</strong></span>
          </div>
        </div>
        <div className="card metric-card" style={{ padding: '18px 20px', minHeight: 130 }}>
          <span className="metric-icon" aria-hidden="true">💰</span>
          <div className="metric-body">
            <span className="metric-title">Sunday Extra Paid</span>
            <span className="metric-value">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(summary.sundayExtraPay)}</span>
            <span className="metric-meta"><strong className="info">From roster policy</strong></span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
        {isLoading ? (
          <TableSkeleton columns={6} rows={4} />
        ) : formattedRows.length > 0 ? (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort('entity')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Entity {getSortArrow('entity')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('owner')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Owner {getSortArrow('owner')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Status {getSortArrow('status')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('budget')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Budget {getSortArrow('budget')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('bonusSplit')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Bonus Split {getSortArrow('bonusSplit')}
                    </button>
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {formattedRows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.entity}</td>
                    <td>{item.owner}</td>
                    <td><span className={`badge ${item.status === 'Approved' || item.status === 'Paid' ? 'success' : item.status === 'Pending Review' ? 'warning' : 'danger'}`}>{item.status}</span></td>
                    <td>{item.budget}</td>
                    <td>{item.bonusSplit}</td>
                    <td>
                      {item.status === 'Pending Review' ? (
                        <button type="button" className="btn tertiary" onClick={() => handleUpdatePayrollStatus(item, 'approved')}>Approve</button>
                      ) : item.status === 'Approved' ? (
                        <button type="button" className="btn tertiary" onClick={() => handleUpdatePayrollStatus(item, 'paid')}>Mark Paid</button>
                      ) : (
                        <span style={{ color: '#64748b', fontWeight: 600 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payroll data found" description="There are no payroll rows available yet from the database." />
        )}
      </div>

      </section>
      <section id="finance-panel-salaries" role="tabpanel" aria-labelledby="finance-tab-salaries" hidden={activeTab !== 'salaries'} tabIndex={0}>
        <div className="card finance-form" style={{ flex: '1 1 380px', padding: 18 }}>
          <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Salary Configuration</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Employee
              <select
                value={salaryForm.employeeId}
                onChange={(event) => {
                  const employeeId = event.target.value;
                  const selectedEmployee = employees.find((item) => item.employeeId === employeeId);
                  setSalaryForm((current) => ({
                    ...current,
                    employeeId,
                    storeId: selectedEmployee?.storeId || current.storeId,
                  }));
                }}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                {employees.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.employeeId} · {employee.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Store
              <select
                value={salaryForm.storeId}
                onChange={(event) => setSalaryForm((current) => ({ ...current, storeId: event.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="">Auto from employee</option>
                {stores.map((store) => (
                  <option key={store.value} value={store.value}>{store.label}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Base Salary
                <input
                  value={salaryForm.baseSalary}
                  onChange={(event) => setSalaryForm((current) => ({ ...current, baseSalary: event.target.value }))}
                  type="number"
                  min={0}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Currency
                <input
                  value={salaryForm.currency}
                  onChange={(event) => setSalaryForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Payout Day
                <input
                  value={salaryForm.payoutDay}
                  onChange={(event) => setSalaryForm((current) => ({ ...current, payoutDay: event.target.value }))}
                  type="number"
                  min={1}
                  max={31}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Payout Mode
                <select
                  value={salaryForm.payoutMode}
                  onChange={(event) => setSalaryForm((current) => ({ ...current, payoutMode: event.target.value as 'bank_transfer' | 'cash' | 'upi' }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Notes
              <input
                value={salaryForm.notes}
                onChange={(event) => setSalaryForm((current) => ({ ...current, notes: event.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              />
            </label>

            <button type="button" className="btn primary" onClick={handleSaveSalaryConfig}>Save Salary Config</button>
          </div>
        </div>

      <section className="card" style={{ marginTop: 18, padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Configured Salaries</h2>
        {salaryConfigs.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Store</th>
                  <th>Base Salary</th>
                  <th>Payout</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {salaryConfigs.map((config) => (
                  <tr key={config.salaryConfigId}>
                    <td>{config.employeeId} · {employeeNameById.get(config.employeeId) || 'Employee'}</td>
                    <td>{stores.find((store) => store.value === String(config.storeId ?? ''))?.label || config.storeId || 'Auto'}</td>
                    <td>{new Intl.NumberFormat('en-US', { style: 'currency', currency: config.currency || 'USD' }).format(Number(config.baseSalary ?? 0))}</td>
                    <td>{config.payoutMode} on day {config.payoutDay}</td>
                    <td>{config.updatedAt ? new Date(config.updatedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No salary configs" description="Create a salary configuration per employee to run salary from attendance automatically." />
        )}
      </section>
      </section>
      <section id="finance-panel-payroll" role="tabpanel" aria-labelledby="finance-tab-payroll" hidden={activeTab !== 'payroll'} tabIndex={0}>
        <div className="card finance-form" style={{ flex: '1 1 380px', padding: 18 }}>
          <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Run Payroll</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Period Start
                <input
                  type="date"
                  value={payrollRunForm.periodStart}
                  onChange={(event) => setPayrollRunForm((current) => ({ ...current, periodStart: event.target.value }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Period End
                <input
                  type="date"
                  value={payrollRunForm.periodEnd}
                  onChange={(event) => setPayrollRunForm((current) => ({ ...current, periodEnd: event.target.value }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>
            </div>

            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Store (optional)
              <select
                value={payrollRunForm.storeId}
                onChange={(event) => setPayrollRunForm((current) => ({ ...current, storeId: event.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="">All stores</option>
                {stores.map((store) => (
                  <option key={store.value} value={store.value}>{store.label}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Fallback Salary (optional)
                <input
                  type="number"
                  min={0}
                  value={payrollRunForm.defaultBaseSalary}
                  onChange={(event) => setPayrollRunForm((current) => ({ ...current, defaultBaseSalary: event.target.value }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Bonus
                <input
                  type="number"
                  min={0}
                  value={payrollRunForm.bonus}
                  onChange={(event) => setPayrollRunForm((current) => ({ ...current, bonus: event.target.value }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Overtime
                <input
                  type="number"
                  min={0}
                  value={payrollRunForm.overtime}
                  onChange={(event) => setPayrollRunForm((current) => ({ ...current, overtime: event.target.value }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                Deductions
                <input
                  type="number"
                  min={0}
                  value={payrollRunForm.deductions}
                  onChange={(event) => setPayrollRunForm((current) => ({ ...current, deductions: event.target.value }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>
            </div>

            <button type="button" className="btn primary" onClick={handleGeneratePayroll}>Generate Payroll</button>
          </div>
        </div>
      <section className="card" style={{ marginTop: 18, padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Payroll Runs</h2>
        {salaryRuns.length > 0 ? (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>Counts</th>
                    <th>Completed</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {salaryRuns.map((run) => (
                    <tr key={run.salaryRunId}>
                      <td>{run.salaryRunId}</td>
                      <td>{new Date(run.periodStart).toLocaleDateString()} - {new Date(run.periodEnd).toLocaleDateString()}</td>
                      <td>{run.status}</td>
                      <td>C:{run.createdPayrollCount} / S:{run.skippedPayrollCount} / F:{run.failedPayrollCount}</td>
                      <td>{run.completedAt ? new Date(run.completedAt).toLocaleString() : 'In progress'}</td>
                      <td><button type="button" className="btn tertiary" onClick={() => handleLoadRunDetail(run.salaryRunId)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedRunDetail && (
              <div style={{ marginTop: 12, padding: 14, borderRadius: 12, border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(248,250,252,0.8)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Run {selectedRunDetail.salaryRunId} · {selectedRunDetail.status}
                </div>
                {Array.isArray(selectedRunDetail.runErrors) && selectedRunDetail.runErrors.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ minWidth: 640 }}>
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRunDetail.runErrors.map((errorRow, index) => (
                          <tr key={`${errorRow.employeeId}-${index}`}>
                            <td>{errorRow.employeeId}</td>
                            <td>{errorRow.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: '#64748b', fontWeight: 600 }}>No run errors for this payroll run.</div>
                )}
              </div>
            )}
          </>
        ) : (
          <EmptyState title="No payroll runs" description="Generate payroll to create run history and per-employee error details." />
        )}
      </section>

      </section>
      <section id="finance-panel-slips" role="tabpanel" aria-labelledby="finance-tab-slips" hidden={activeTab !== 'slips'} tabIndex={0}>
      <section className="card" style={{ marginTop: 18, padding: 18 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <select
            value={slipEmployeeId}
            onChange={(event) => setSlipEmployeeId(event.target.value)}
            style={{ minWidth: 280, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
          >
            {employees.map((employee) => (
              <option key={employee.employeeId} value={employee.employeeId}>
                {employee.employeeId} · {employee.fullName}
              </option>
            ))}
          </select>
          <button type="button" className="btn secondary" onClick={handleLoadEmployeeSlips}>Load Slips</button>
        </div>

        {slipRows.length > 0 ? (
          <div style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table className="table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Payroll ID</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Net Salary</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {slipRows.map((row) => (
                  <tr key={row.payrollId}>
                    <td>{row.payrollId}</td>
                    <td>{new Date(row.periodStart).toLocaleDateString()} - {new Date(row.periodEnd).toLocaleDateString()}</td>
                    <td>{row.status}</td>
                    <td>{new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency || 'USD' }).format(row.netSalary)}</td>
                    <td>
                      <button type="button" className="btn tertiary" onClick={() => handleLoadSlipDetail(row.payrollId)}>View Slip</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No slips loaded" description="Select an employee and load salary slips." />
        )}

        {selectedSlip && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 12, border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(248,250,252,0.8)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              Slip {String(selectedSlip?.slipId ?? '')} · {employeeNameById.get(String(selectedSlip?.employeeId ?? '')) || String(selectedSlip?.employeeId ?? '')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
              <div>Net Salary: <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: String(selectedSlip?.payout?.currency ?? 'USD') }).format(Number(selectedSlip?.totals?.netSalary ?? 0))}</strong></div>
              <div>Payout Day: <strong>{Number(selectedSlip?.payout?.payoutDay ?? 1)}</strong></div>
              <div>Payout Mode: <strong>{String(selectedSlip?.payout?.payoutMode ?? 'bank_transfer')}</strong></div>
              <div>Payable Days: <strong>{Number(selectedSlip?.attendance?.payableDays ?? 0)}</strong></div>
              <div>Absent Days: <strong>{Number(selectedSlip?.attendance?.absentDays ?? 0)}</strong></div>
              <div>Sunday Extra: <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: String(selectedSlip?.payout?.currency ?? 'USD') }).format(Number(selectedSlip?.earnings?.sundayExtraPay ?? 0))}</strong></div>
            </div>
          </div>
        )}
      </section>

      </section>
    </main>
  );
}
