'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';

type StoreOption = {
  value: string;
  label: string;
};

type EmployeeOption = {
  employeeId: string;
  fullName: string;
  storeId: string;
};

type MessageRow = {
  messageId: string;
  title: string;
  body: string;
  emoji?: string;
  imageUrl?: string | null;
  styleVariant?: 'standard' | 'info' | 'success' | 'warning' | 'celebration' | 'memorial';
  textFormat?: 'plain' | 'markdown';
  actionLabel?: string | null;
  actionUrl?: string | null;
  category: string;
  scope: 'organization' | 'store' | 'employee';
  targetStoreId?: string | null;
  targetEmployeeIds?: string[];
  priority: 'normal' | 'high';
  startsAt?: string;
  expiresAt?: string | null;
  createdAt?: string;
  isActive?: boolean;
};

const categories = [
  { value: 'general', label: 'General' },
  { value: 'instruction', label: 'Instruction' },
  { value: 'alert', label: 'Alert' },
  { value: 'motivation', label: 'Motivation' },
  { value: 'felicitation', label: 'Felicitation' },
  { value: 'achievement', label: 'Achievement' },
  { value: 'celebration', label: 'Celebration' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'work_anniversary', label: 'Work Anniversary' },
  { value: 'obituary', label: 'Obituary' },
] as const;

function getExpiryModeLabel(message: MessageRow) {
  const startsAtValue = String(message.startsAt ?? '').trim();
  const expiresAtValue = String(message.expiresAt ?? '').trim();

  if (!expiresAtValue) {
    return startsAtValue ? 'Scheduled / No expiry' : 'No auto expiry';
  }

  const startDate = startsAtValue ? new Date(startsAtValue) : new Date(message.createdAt ?? '');
  const expiryDate = new Date(expiresAtValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(expiryDate.getTime())) {
    return 'Custom expiry';
  }

  const diffMs = expiryDate.getTime() - startDate.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(diffMs / dayMs);

  if (diffDays === 1) return '1 day preset';
  if (diffDays === 3) return '3 days preset';
  if (diffDays === 7) return '7 days preset';

  return 'Custom expiry';
}

function getExpiryModeBadgeStyle(expiryMode: string) {
  if (expiryMode === 'No auto expiry') {
    return { border: '1px solid rgba(100,116,139,0.35)', background: 'rgba(100,116,139,0.12)', color: '#334155' };
  }

  if (expiryMode === 'Scheduled / No expiry') {
    return { border: '1px solid rgba(14,116,144,0.35)', background: 'rgba(14,116,144,0.12)', color: '#0e7490' };
  }

  if (expiryMode === '1 day preset') {
    return { border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.12)', color: '#b45309' };
  }

  if (expiryMode === '3 days preset') {
    return { border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.12)', color: '#1d4ed8' };
  }

  if (expiryMode === '7 days preset') {
    return { border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.12)', color: '#047857' };
  }

  return { border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.12)', color: '#7e22ce' };
}

export default function MessagesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [form, setForm] = useState({
    title: '',
    body: '',
    emoji: '',
    imageUrl: '',
    styleVariant: 'standard' as 'standard' | 'info' | 'success' | 'warning' | 'celebration' | 'memorial',
    textFormat: 'plain' as 'plain' | 'markdown',
    actionLabel: '',
    actionUrl: '',
    category: 'general',
    scope: 'organization' as 'organization' | 'store' | 'employee',
    targetStoreId: '',
    targetEmployeeId: '',
    priority: 'normal' as 'normal' | 'high',
    expiryPreset: 'none' as 'none' | '1d' | '3d' | '7d' | 'custom',
    startsAt: '',
    expiresAt: '',
  });

  const visibleEmployees = useMemo(() => {
    if (form.scope !== 'employee') {
      return employees;
    }

    if (!form.targetStoreId) {
      return employees;
    }

    return employees.filter((item) => item.storeId === form.targetStoreId);
  }, [employees, form.scope, form.targetStoreId]);

  const loadMessagesData = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [storeEntries, employeeEntries, messageEntries] = await Promise.all([
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores'),
        apiFetchWithRetry<Array<{ employeeId?: string; employeeCode?: string; firstName?: string; lastName?: string; storeId?: string }>>('/employees'),
        apiFetchWithRetry<MessageRow[]>('/accounting/messages?limit=50'),
      ]);

      const storeOptions = (Array.isArray(storeEntries) ? storeEntries : [])
        .map((store) => ({
          value: String(store?._id ?? store?.id ?? '').trim(),
          label: String(store?.name ?? '').trim(),
        }))
        .filter((item) => item.value && item.label);

      const employeeOptions = (Array.isArray(employeeEntries) ? employeeEntries : [])
        .map((entry) => {
          const employeeId = String(entry?.employeeId ?? entry?.employeeCode ?? '').trim();
          if (!employeeId) {
            return null;
          }

          return {
            employeeId,
            fullName: `${String(entry?.firstName ?? '').trim()} ${String(entry?.lastName ?? '').trim()}`.trim() || employeeId,
            storeId: String(entry?.storeId ?? '').trim(),
          } satisfies EmployeeOption;
        })
        .filter((entry): entry is EmployeeOption => Boolean(entry));

      setStores(storeOptions);
      setEmployees(employeeOptions);
      setMessages(Array.isArray(messageEntries) ? messageEntries : []);

      setForm((current) => ({
        ...current,
        targetStoreId: current.targetStoreId || storeOptions[0]?.value || '',
        targetEmployeeId: current.targetEmployeeId || employeeOptions[0]?.employeeId || '',
      }));
    } catch {
      setErrorMessage('Unable to load messaging data.');
      setStores([]);
      setEmployees([]);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMessagesData();
  }, []);

  const handleSendMessage = async () => {
    setStatusMessage('');
    setErrorMessage('');

    const title = form.title.trim();
    const body = form.body.trim();

    if (!title || !body) {
      setErrorMessage('Title and message are required.');
      return;
    }

    if (form.scope === 'store' && !form.targetStoreId) {
      setErrorMessage('Select a target store for store-wide messages.');
      return;
    }

    if (form.scope === 'employee' && !form.targetEmployeeId) {
      setErrorMessage('Select an employee for individual message.');
      return;
    }

    setIsSubmitting(true);

    try {
      const startsAtDate = form.startsAt ? new Date(form.startsAt) : new Date();
      const baseStart = Number.isNaN(startsAtDate.getTime()) ? new Date() : startsAtDate;

      let computedExpiresAt: string | undefined;
      if (form.expiryPreset === 'custom') {
        computedExpiresAt = form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined;
      } else if (form.expiryPreset === '1d' || form.expiryPreset === '3d' || form.expiryPreset === '7d') {
        const days = form.expiryPreset === '1d' ? 1 : form.expiryPreset === '3d' ? 3 : 7;
        computedExpiresAt = new Date(baseStart.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
      }

      await apiFetch('/accounting/messages', {
        method: 'POST',
        body: JSON.stringify({
          title,
          body,
          emoji: form.emoji || undefined,
          imageUrl: form.imageUrl || undefined,
          styleVariant: form.styleVariant,
          textFormat: form.textFormat,
          actionLabel: form.actionLabel || undefined,
          actionUrl: form.actionUrl || undefined,
          category: form.category,
          scope: form.scope,
          targetStoreId: form.scope === 'store' || form.scope === 'employee' ? form.targetStoreId || undefined : undefined,
          targetEmployeeIds: form.scope === 'employee' ? [form.targetEmployeeId] : undefined,
          priority: form.priority,
          startsAt: form.startsAt ? baseStart.toISOString() : undefined,
          expiresAt: computedExpiresAt,
        }),
      });

      setStatusMessage('Message saved. It will appear in the selected employees’ mobile feed during its scheduled dates.');
      setForm((current) => ({
        ...current,
        title: '',
        body: '',
        emoji: '',
        imageUrl: '',
        actionLabel: '',
        actionUrl: '',
        expiryPreset: 'none',
        expiresAt: '',
      }));
      await loadMessagesData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="portal-page">

      {statusMessage && (
        <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)', color: '#047857', fontWeight: 700 }}>
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#b91c1c', fontWeight: 700 }}>
          {errorMessage}
        </div>
      )}

      <section className="card" style={{ padding: 18, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Send Message</h2>

        <div style={{ display: 'grid', gap: 10 }}>
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Message title"
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
          />

          <textarea
            value={form.body}
            onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
            placeholder="Write message content"
            rows={5}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', resize: 'vertical' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Emoji (optional)
              <input
                value={form.emoji}
                onChange={(event) => setForm((current) => ({ ...current, emoji: event.target.value }))}
                placeholder="🎉"
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Style Variant
              <select
                value={form.styleVariant}
                onChange={(event) => setForm((current) => ({ ...current, styleVariant: event.target.value as 'standard' | 'info' | 'success' | 'warning' | 'celebration' | 'memorial' }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="standard">Standard</option>
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="celebration">Celebration</option>
                <option value="memorial">Memorial</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Text Format
              <select
                value={form.textFormat}
                onChange={(event) => setForm((current) => ({ ...current, textFormat: event.target.value as 'plain' | 'markdown' }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="plain">Plain</option>
                <option value="markdown">Markdown</option>
              </select>
            </label>
          </div>

          <input
            value={form.imageUrl}
            onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))}
            placeholder="Image URL (optional)"
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <input
              value={form.actionLabel}
              onChange={(event) => setForm((current) => ({ ...current, actionLabel: event.target.value }))}
              placeholder="Action label (optional)"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
            />
            <input
              value={form.actionUrl}
              onChange={(event) => setForm((current) => ({ ...current, actionUrl: event.target.value }))}
              placeholder="Action URL (optional)"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Category
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Scope
              <select
                value={form.scope}
                onChange={(event) => {
                  const scope = event.target.value as 'organization' | 'store' | 'employee';
                  setForm((current) => ({
                    ...current,
                    scope,
                  }));
                }}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="organization">Organization Wide</option>
                <option value="store">Store Wide</option>
                <option value="employee">Individual Employee</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Priority
              <select
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as 'normal' | 'high' }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Auto Expiry
              <select
                value={form.expiryPreset}
                onChange={(event) => {
                  const preset = event.target.value as 'none' | '1d' | '3d' | '7d' | 'custom';
                  setForm((current) => ({
                    ...current,
                    expiryPreset: preset,
                    expiresAt: preset === 'custom' ? current.expiresAt : '',
                  }));
                }}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="none">No auto expiry</option>
                <option value="1d">Expire in 1 day</option>
                <option value="3d">Expire in 3 days</option>
                <option value="7d">Expire in 7 days</option>
                <option value="custom">Custom expiry</option>
              </select>
            </label>
          </div>

          {(form.scope === 'store' || form.scope === 'employee') && (
            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Target Store
              <select
                value={form.targetStoreId}
                onChange={(event) => setForm((current) => ({ ...current, targetStoreId: event.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                {stores.map((store) => (
                  <option key={store.value} value={store.value}>{store.label}</option>
                ))}
              </select>
            </label>
          )}

          {form.scope === 'employee' && (
            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Employee
              <select
                value={form.targetEmployeeId}
                onChange={(event) => setForm((current) => ({ ...current, targetEmployeeId: event.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                {visibleEmployees.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.employeeId} · {employee.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Starts At (optional)
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
              Expires At (optional)
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                disabled={form.expiryPreset !== 'custom'}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              />
            </label>
          </div>

          <button type="button" className="btn primary" onClick={handleSendMessage} disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Sent Messages</h2>

        {isLoading ? (
          <TableSkeleton columns={8} rows={5} />
        ) : messages.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 1240 }}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Style</th>
                  <th>Scope</th>
                  <th>Target</th>
                  <th>Priority</th>
                  <th>Expiry Mode</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => {
                  const expiryMode = getExpiryModeLabel(message);
                  return (
                  <tr key={message.messageId}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{`${message.emoji ? `${message.emoji} ` : ''}${message.title}`}</div>
                      <div style={{ color: '#64748b', marginTop: 4 }}>{message.body}</div>
                      {message.imageUrl ? (
                        <div style={{ color: '#0f766e', marginTop: 4, fontWeight: 600 }}>Image attached</div>
                      ) : null}
                      {message.actionLabel ? (
                        <div style={{ color: '#334155', marginTop: 4 }}>
                          CTA: {message.actionLabel}
                        </div>
                      ) : null}
                    </td>
                    <td>{message.category}</td>
                    <td>{`${message.styleVariant ?? 'standard'} / ${message.textFormat ?? 'plain'}`}</td>
                    <td>{message.scope}</td>
                    <td>
                      {message.scope === 'organization'
                        ? 'All employees'
                        : message.scope === 'store'
                          ? stores.find((store) => store.value === String(message.targetStoreId ?? ''))?.label || message.targetStoreId || 'Store'
                          : (message.targetEmployeeIds || []).join(', ') || 'Employee'}
                    </td>
                    <td>{message.priority}</td>
                    <td>
                      <span
                        style={{
                          ...getExpiryModeBadgeStyle(expiryMode),
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontWeight: 700,
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {expiryMode}
                      </span>
                    </td>
                    <td>{message.createdAt ? new Date(message.createdAt).toLocaleString() : '—'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No messages yet" description="Use the form above to send the first organization, store, or employee message." />
        )}
      </section>
    </main>
  );
}
