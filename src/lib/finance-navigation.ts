export const financeNavigation = [
  { href: '/finance', label: 'Overview' },
  { href: '/finance/salaries', label: 'Salaries' },
  { href: '/finance/payroll', label: 'Payroll runs' },
  { href: '/finance/slips', label: 'Salary slips' },
] as const;

export type FinanceTab = (typeof financeNavigation)[number]['label'];
