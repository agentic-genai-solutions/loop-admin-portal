'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { apiFetch, apiFetchWithRetry, handleUnauthorizedSession } from '@/lib/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000';
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

type UserProfile = {
  _id?: string;
  email?: string;
  mobile?: string;
  mobileNumber?: string;
  countryCode?: string;
  role?: string;
  title?: string | null;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | Date | null;
  joinedDate?: string | Date | null;
  gender?: string;
  bloodGroup?: string | null;
  designation?: string;
  designationLabel?: string;
  designationId?: string | null;
  onboarding?: string;
  profileImage?: string | null;
  isActive?: boolean;
  passwordResetRequired?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

const splitMobileValue = (value?: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return { countryCode: '+91', mobileNumber: '' };
  }

  if (raw.startsWith('+')) {
    const match = raw.match(/^\+\d{1,4}/);
    const countryCode = match?.[0] ?? '+91';
    const mobileNumber = raw.replace(countryCode, '').replace(/\D/g, '');
    return { countryCode, mobileNumber };
  }

  return { countryCode: '+91', mobileNumber: raw.replace(/\D/g, '') };
};

const emptyForm = {
  title: '',
  firstName: '',
  lastName: '',
  email: '',
  countryCode: '+91',
  mobileNumber: '',
  mobile: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
};

const getDisplayName = (source: Partial<UserProfile> & { title?: string | null; firstName?: string; lastName?: string }) =>
  [source.title, source.firstName, source.lastName].filter(Boolean).join(' ').trim() || 'User profile';

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile>({});
  const [form, setForm] = useState({ ...emptyForm, profileImage: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDragOverImageZone, setIsDragOverImageZone] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [designationOptions, setDesignationOptions] = useState<Array<{ value: string; label: string }>>([]);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

  const designationLabel = profile.designationLabel
    || designationOptions.find((option) => option.value === profile.designationId)?.label
    || '';
  const profileName = getDisplayName(profile);
  const draftProfileName = getDisplayName({ title: form.title, firstName: form.firstName, lastName: form.lastName });
  const profileInitials = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .join(' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
  const [activeTab, setActiveTab] = useState<'overview' | 'personal' | 'employment'>('overview');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [showPassword, setShowPassword] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const confirmPasswordMismatch = Boolean(
    !passwordSuccess
    && passwordForm.confirmPassword.trim()
    && passwordForm.newPassword !== passwordForm.confirmPassword,
  );

  useEffect(() => {
    if (!isEditing && !isPasswordModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('profile-modal-open');

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isPasswordModalOpen) {
          closePasswordModal();
          return;
        }
        closeEditMode();
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('profile-modal-open');
      window.removeEventListener('keydown', onEscape);
    };
  }, [isEditing, isPasswordModalOpen]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = window.sessionStorage.getItem('loop_admin_token');
        if (!token) {
          return;
        }

        const [profileResponse, designationResponse] = await Promise.all([
          apiFetch<UserProfile>('/users/me'),
          apiFetchWithRetry<Array<{ _id?: string; label?: string }>>('/master-data/designations').catch(() => []),
        ]);

        setDesignationOptions(
          Array.isArray(designationResponse)
            ? designationResponse
              .map((item) => ({ value: String(item._id ?? '').trim(), label: String(item.label ?? '').trim() }))
              .filter((item) => item.value && item.label)
            : [],
        );

        const phoneNo = profileResponse.mobile ?? '';

        setProfile(profileResponse);
        setForm({
          title: profileResponse.title ?? '',
          firstName: profileResponse.firstName ?? '',
          lastName: profileResponse.lastName ?? '',
          email: profileResponse.email ?? '',
          countryCode: profileResponse.countryCode ?? '+91',
          mobileNumber: phoneNo,
          mobile: profileResponse.mobile ?? phoneNo,
          dateOfBirth: profileResponse.dateOfBirth ? new Date(profileResponse.dateOfBirth).toISOString().slice(0, 10) : '',
          gender: profileResponse.gender ?? '',
          bloodGroup: profileResponse.bloodGroup ?? '',
          profileImage: profileResponse.profileImage ?? '',
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const updateField = (field: keyof Omit<typeof emptyForm, 'profileImage'> | 'profileImage', value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const formatDateValue = (value?: string | Date | null) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const openEditMode = () => {
    setError('');
    setSuccess('');
    setForm({
      title: profile.title ?? '',
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      email: profile.email ?? '',
      countryCode: profile.countryCode ?? '+91',
      mobileNumber: profile.mobile ?? '',
      mobile: profile.mobile ?? '',
      dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().slice(0, 10) : '',
      gender: profile.gender ?? '',
      bloodGroup: profile.bloodGroup ?? '',
      profileImage: profile.profileImage ?? '',
    });
    setIsEditing(true);
  };

  const closeEditMode = () => {
    setError('');
    setSuccess('');
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setIsPasswordModalOpen(false);
    setIsEditing(false);
  };

  const openPasswordModal = () => {
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setIsPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setIsPasswordModalOpen(false);
  };

  const updatePasswordField = (field: 'currentPassword' | 'newPassword' | 'confirmPassword', value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const togglePasswordVisibility = (field: 'currentPassword' | 'newPassword' | 'confirmPassword') => {
    setShowPassword((current) => ({ ...current, [field]: !current[field] }));
  };

  const processProfileImageFile = (file: File) => {
    const fileName = file.name.toLowerCase();
    const isImageMime = file.type.startsWith('image/');
    const hasValidExtension = ALLOWED_IMAGE_EXTENSIONS.some((extension) => fileName.endsWith(extension));

    if (!isImageMime || !hasValidExtension) {
      setError(`Only image files are allowed (${ALLOWED_IMAGE_EXTENSIONS.join(', ')})`);
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      setError('Profile image must be 2MB or smaller');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageData = typeof reader.result === 'string' ? reader.result : '';
      setForm((current) => ({ ...current, profileImage: imageData }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processProfileImageFile(file);
  };

  const handleImageDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOverImageZone(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    processProfileImageFile(file);
  };

  const handlePasswordLogout = () => {
    window.sessionStorage.removeItem('loop_admin_token');
    window.sessionStorage.removeItem('loop_admin_user');
    window.sessionStorage.removeItem('loop_admin_last_activity');
    window.location.href = '/login';
  };

  const handlePasswordSubmit = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!passwordForm.currentPassword.trim()) {
      setPasswordError('Current password is required.');
      return;
    }

    if (!passwordForm.newPassword.trim() || passwordForm.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setPasswordSaving(true);

    try {
      const token = window.sessionStorage.getItem('loop_admin_token');
      if (!token) {
        handleUnauthorizedSession('Your session has timed out. Click OK to log in again.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (response.status === 401) {
        handleUnauthorizedSession('Your session has timed out. Click OK to log in again.');
        return;
      }

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to update password');
      }

      setPasswordSuccess('Successful password reset. You will be logged out and need to sign in again with your new password.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPassword({ currentPassword: false, newPassword: false, confirmPassword: false });
    } catch (submitError) {
      setPasswordError(submitError instanceof Error ? submitError.message : 'Unable to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const token = window.sessionStorage.getItem('loop_admin_token');
      if (!token) {
        handleUnauthorizedSession('Your session has timed out. Click OK to log in again.');
        return;
      }

      const body: Record<string, string | null | undefined> = {
        title: form.title.trim() || null,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        countryCode: form.countryCode?.trim() || '+91',
        mobile: form.mobileNumber?.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        bloodGroup: form.bloodGroup ? form.bloodGroup.trim().toUpperCase() : null,
        profileImage: form.profileImage || null,
      };

      const existingCountry = profile as Record<string, unknown>;
      const sanitizedBody: Record<string, string | null | undefined> = {};
      Object.entries(body).forEach(([key, value]) => {
        const currentValue = existingCountry[key];
        const normalizedCurrent = currentValue == null ? '' : String(currentValue);
        const normalizedValue = value == null ? '' : String(value);

        if (normalizedValue !== normalizedCurrent) {
          sanitizedBody[key] = value;
        }
      });

      if (Object.keys(sanitizedBody).length === 0) {
        setSuccess('No profile changes detected.');
        return;
      }

      const payload = await apiFetch<UserProfile>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(sanitizedBody),
      });

      setProfile(payload);
      const mobileParts = splitMobileValue(payload.mobile || `${payload.countryCode ?? '+91'}${payload.mobileNumber ?? ''}`);
      setForm({
        title: payload.title ?? '',
        firstName: payload.firstName ?? '',
        lastName: payload.lastName ?? '',
        email: payload.email ?? '',
        countryCode: payload.countryCode ?? mobileParts.countryCode,
        mobileNumber: payload.mobileNumber ?? mobileParts.mobileNumber,
        mobile: payload.mobile ?? '',
        dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth).toISOString().slice(0, 10) : '',
        gender: payload.gender ?? '',
        bloodGroup: payload.bloodGroup ?? '',
        profileImage: payload.profileImage ?? '',
      });
      setSuccess('Profile updated successfully.');
      setIsEditing(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="portal-page dashboard-shell">
        <div className="panel" style={{ padding: 24 }}>
          <p>Loading profile...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-page dashboard-shell profile-page-shell">
      <section className="panel profile-page-panel" style={{ maxWidth: 1280, width: '100%', margin: '0 auto', padding: 0, overflow: 'hidden', borderRadius: 18, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gap: 0 }}>
          <div
            className="profile-header-row"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              padding: '14px 22px 10px',
              background: 'linear-gradient(135deg, #04070d 0%, #0d1725 42%, #1a2736 100%)',
              color: '#f8fafc',
            }}
          >
            <div className="profile-header-identity" style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 220 }}>
              {profile.profileImage ? (
                <img
                  src={profile.profileImage}
                  alt="Profile"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 16,
                    objectFit: 'cover',
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    boxShadow: '0 18px 30px rgba(15, 23, 42, 0.18)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 16,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(148,163,184,0.2))',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    fontWeight: 800,
                    boxShadow: '0 18px 30px rgba(15, 23, 42, 0.18)',
                  }}
                >
                  {profileInitials || 'U'}
                </div>
              )}

              <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                <p className="eyebrow" style={{ color: 'rgba(226,232,240,0.72)', margin: 0, letterSpacing: '0.18em', fontSize: 10 }}>Overview</p>
                <h2 className="profile-name" style={{ margin: 0, fontSize: 'clamp(1.25rem, 1.5vw, 1.9rem)', lineHeight: 1.1, letterSpacing: '-0.04em', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profileName}
                </h2>
                <div className="profile-designation" style={{ color: 'rgba(226,232,240,0.9)', fontWeight: 700, fontSize: 12 }}>{designationLabel || 'Designation not set'}</div>
              </div>
            </div>

            {!isEditing && (
              <button
                type="button"
                className="primary-button profile-edit-button"
                onClick={openEditMode}
                style={{
                  background: '#ffffff',
                  color: '#0a0f1a',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 800,
                  minWidth: 128,
                  boxShadow: '0 16px 30px rgba(0, 0, 0, 0.22)',
                }}
              >
                Edit profile
              </button>
            )}
          </div>

          {!isEditing && (
            <>
              <div
                className="profile-tabs-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 22px 0',
                  margin: 0,
                  background: '#f8fafc',
                  borderBottom: '1px solid #dfe7f0',
                }}
              >
                <div className="profile-tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { key: 'overview', label: 'Overview' },
                    { key: 'personal', label: 'Personal' },
                    { key: 'employment', label: 'Employment' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className="profile-tab-button"
                      onClick={() => setActiveTab(tab.key as 'overview' | 'personal' | 'employment')}
                      style={{
                        minWidth: 118,
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: activeTab === tab.key ? '1px solid rgba(15, 23, 42, 0.12)' : '1px solid #dbe4ee',
                        background: activeTab === tab.key ? '#0f172a' : '#f8fafc',
                        color: activeTab === tab.key ? '#fff' : '#0f172a',
                        fontWeight: 800,
                        fontSize: 12.5,
                        cursor: 'pointer',
                        boxShadow: activeTab === tab.key ? '0 12px 20px rgba(15, 23, 42, 0.08)' : 'none',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="secondary-button profile-password-button"
                  onClick={openPasswordModal}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#0f172a',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontWeight: 800,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Change password
                </button>
              </div>

              {activeTab === 'overview' && (
                <div className="profile-content-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: '12px 22px 12px', background: '#f8fafc' }}>
                  <div className="panel profile-summary-card" style={{ padding: 10, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.email || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 12, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Mobile</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.mobile || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 12, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Designation</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{designationLabel || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 12, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gender</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1).replace(/_/g, ' ') : 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 12, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Blood Group</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.bloodGroup || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 12, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Joined</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{formatDateValue(profile.joinedDate)}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 12, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Date of Birth</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{formatDateValue(profile.dateOfBirth)}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 12, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.isActive === false ? 'Inactive' : 'Active'}</div>
                  </div>
                </div>
              )}

              {activeTab === 'personal' && (
                <div className="profile-content-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, padding: '18px 28px 0', background: '#f8fafc' }}>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Title</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.title || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>First name</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.firstName || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Last name</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.lastName || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.email || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Mobile</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.mobile || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Date of birth</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{formatDateValue(profile.dateOfBirth)}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Blood group</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.bloodGroup || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gender</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1).replace(/_/g, ' ') : 'Not set'}</div>
                  </div>
                </div>
              )}

              {activeTab === 'employment' && (
                <div className="profile-content-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, padding: '18px 28px 0', background: '#f8fafc' }}>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Designation</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{designationLabel || 'Not set'}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Joined date</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{formatDateValue(profile.joinedDate)}</div>
                  </div>
                  <div className="panel profile-summary-card" style={{ padding: 16, background: '#f8fafc' }}>
                    <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</div>
                    <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13 }}>{profile.isActive === false ? 'Inactive' : 'Active'}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {isEditing && (
            <div
              className="profile-modal-layer"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                zIndex: 60,
                pointerEvents: 'auto',
              }}
              onClick={closeEditMode}
            >
              <div
                className="profile-modal-card profile-edit-modal"
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: 'min(760px, 100%)',
                  height: 'min(88vh, 860px)',
                  maxHeight: '88vh',
                  background: '#f8fafc',
                  borderRadius: 20,
                  boxShadow: '0 30px 80px rgba(15, 23, 42, 0.2)',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  pointerEvents: 'auto',
                }}
              >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '28px 28px 18px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                    <div>
                      <p className="eyebrow" style={{ margin: 0 }}>Edit profile</p>
                      <h3 style={{ margin: '6px 0 0', fontSize: 28 }}>Update your information</h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeEditMode}
                      aria-label="Close edit profile"
                      style={{
                        width: 40,
                        height: 40,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        borderRadius: 12,
                        padding: 0,
                        cursor: 'pointer',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0f172a',
                        fontSize: 20,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 28px 0', WebkitOverflowScrolling: 'touch' }}>
                    <div style={{ display: 'grid', gap: 18 }}>
                      <div style={{ display: 'grid', gap: 12 }}>
                        <label style={{ display: 'grid', gap: 8, fontWeight: 700 }}>
                          Profile image
                          {form.profileImage ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
                              <img
                                src={form.profileImage}
                                alt="Selected profile"
                                style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: '1px solid #cbd5e1' }}
                              />
                              <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>Current profile image</span>
                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>Click Change image or drag a new file below</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => profileImageInputRef.current?.click()}
                                style={{
                                  border: '1px solid #cbd5e1',
                                  background: '#f8fafc',
                                  color: '#0f172a',
                                  borderRadius: 10,
                                  padding: '8px 10px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Change image
                              </button>
                            </div>
                          ) : null}
                          <div
                            onDragOver={(event) => {
                              event.preventDefault();
                              setIsDragOverImageZone(true);
                            }}
                            onDragLeave={() => setIsDragOverImageZone(false)}
                            onDrop={handleImageDrop}
                            onClick={() => profileImageInputRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                profileImageInputRef.current?.click();
                              }
                            }}
                            style={{
                              border: `1px dashed ${isDragOverImageZone ? '#334155' : '#cbd5e1'}`,
                              background: isDragOverImageZone ? '#eef2ff' : '#fff',
                              borderRadius: 12,
                              padding: '16px 14px',
                              textAlign: 'center',
                              color: '#475569',
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: 'pointer',
                              display: 'grid',
                              placeItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⤴</span>
                            <span>{form.profileImage ? 'Click or drag and drop to change' : 'Click or drag and drop'}</span>
                            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                              Supported: {ALLOWED_IMAGE_EXTENSIONS.join(', ')} · Max 2MB
                            </span>
                          </div>
                          <input
                            ref={profileImageInputRef}
                            type="file"
                            accept={ALLOWED_IMAGE_EXTENSIONS.join(',')}
                            onChange={handleImageUpload}
                            style={{
                              position: 'absolute',
                              width: 1,
                              height: 1,
                              padding: 0,
                              margin: -1,
                              overflow: 'hidden',
                              clip: 'rect(0, 0, 0, 0)',
                              whiteSpace: 'nowrap',
                              border: 0,
                            }}
                          />
                        </label>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Title</span>
                          <select value={form.title} onChange={(event) => updateField('title', event.target.value)} style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}>
                            <option value="">Select</option>
                            <option value="Mr">Mr</option>
                            <option value="Mrs">Mrs</option>
                            <option value="Ms">Ms</option>
                            <option value="Miss">Miss</option>
                            <option value="Dr">Dr</option>
                            <option value="Prof">Prof</option>
                          </select>
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>First name</span>
                          <input value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }} />
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Last name</span>
                          <input value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }} />
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Email</span>
                          <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }} />
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Country code</span>
                          <input
                            value={form.countryCode}
                            onChange={(event) => updateField('countryCode', event.target.value)}
                            style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Mobile</span>
                          <input
                            type="tel"
                            value={form.mobileNumber}
                            onChange={(event) => updateField('mobileNumber', event.target.value)}
                            style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Date of birth</span>
                          <input type="date" value={form.dateOfBirth} onChange={(event) => updateField('dateOfBirth', event.target.value)} style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }} />
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Gender</span>
                          <select value={form.gender} onChange={(event) => updateField('gender', event.target.value)} style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}>
                            <option value="">Select</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                            <option value="prefer_not_to_say">Prefer not to say</option>
                          </select>
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Blood group</span>
                          <select value={form.bloodGroup} onChange={(event) => updateField('bloodGroup', event.target.value)} style={{ padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}>
                            <option value="">Select</option>
                            <option value="A+">A+</option>
                            <option value="A-">A-</option>
                            <option value="B+">B+</option>
                            <option value="B-">B-</option>
                            <option value="AB+">AB+</option>
                            <option value="AB-">AB-</option>
                            <option value="O+">O+</option>
                            <option value="O-">O-</option>
                          </select>
                        </label>

                      </div>

                      {error && (
                        <div style={{ padding: '10px 12px', background: '#fef2f2', color: '#991b1b', borderRadius: 12, border: '1px solid #fecaca' }}>
                          {error}
                        </div>
                      )}

                      {success && (
                        <div style={{ padding: '10px 12px', background: '#ecfdf5', color: '#166534', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                          {success}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', padding: '18px 28px 28px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                    <button type="button" className="secondary-button" onClick={closeEditMode}>
                      Cancel
                    </button>
                    <button type="submit" disabled={saving} className="primary-button">
                      {saving ? 'Saving...' : 'Update profile'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {isPasswordModalOpen && (
            <div
              className="profile-modal-layer"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                zIndex: 70,
                pointerEvents: 'auto',
              }}
              onClick={closePasswordModal}
            >
              <div
                className="profile-modal-card profile-password-modal"
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: 'min(520px, 100%)',
                  background: '#fff',
                  borderRadius: 20,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 30px 80px rgba(15, 23, 42, 0.2)',
                  overflow: 'hidden',
                  pointerEvents: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '24px 24px 16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div>
                    <p className="eyebrow" style={{ margin: 0 }}>Security</p>
                    <h3 style={{ margin: '6px 0 0', fontSize: 24 }}>Change password</h3>
                  </div>
                  {!passwordSuccess && (
                    <button
                      type="button"
                      onClick={closePasswordModal}
                      aria-label="Close change password"
                      style={{
                        width: 40,
                        height: 40,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        borderRadius: 12,
                        padding: 0,
                        cursor: 'pointer',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0f172a',
                        fontSize: 20,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                <div style={{ padding: '20px 24px 0' }}>
                  <div style={{ display: 'grid', gap: 18 }}>
                    {!passwordSuccess && (
                      <>
                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Current password</span>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showPassword.currentPassword ? 'text' : 'password'}
                              value={passwordForm.currentPassword}
                              onChange={(event) => updatePasswordField('currentPassword', event.target.value)}
                              placeholder="Enter current password"
                              style={{ width: '100%', padding: '12px 42px 12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}
                            />
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility('currentPassword')}
                              aria-label={showPassword.currentPassword ? 'Hide current password' : 'Show current password'}
                              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569', fontSize: 12, fontWeight: 700 }}
                            >
                              {showPassword.currentPassword ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>New password</span>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showPassword.newPassword ? 'text' : 'password'}
                              value={passwordForm.newPassword}
                              onChange={(event) => updatePasswordField('newPassword', event.target.value)}
                              placeholder="Enter new password"
                              style={{ width: '100%', padding: '12px 42px 12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}
                            />
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility('newPassword')}
                              aria-label={showPassword.newPassword ? 'Hide new password' : 'Show new password'}
                              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569', fontSize: 12, fontWeight: 700 }}
                            >
                              {showPassword.newPassword ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </label>

                        <label style={{ display: 'grid', gap: 8 }}>
                          <span style={{ fontWeight: 700 }}>Confirm password</span>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showPassword.confirmPassword ? 'text' : 'password'}
                              value={passwordForm.confirmPassword}
                              onChange={(event) => updatePasswordField('confirmPassword', event.target.value)}
                              placeholder="Confirm password"
                              style={{ width: '100%', padding: '12px 42px 12px 14px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff' }}
                            />
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility('confirmPassword')}
                              aria-label={showPassword.confirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569', fontSize: 12, fontWeight: 700 }}
                            >
                              {showPassword.confirmPassword ? 'Hide' : 'Show'}
                            </button>
                          </div>
                          {confirmPasswordMismatch && (
                            <span style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
                              Re-entered password does not match the new password.
                            </span>
                          )}
                        </label>
                      </>
                    )}

                    {passwordError && passwordError !== 'New password and confirmation do not match.' && (
                      <div style={{ padding: '10px 12px', background: '#fef2f2', color: '#991b1b', borderRadius: 12, border: '1px solid #fecaca' }}>
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div style={{ display: 'grid', gap: 12, padding: '18px 18px', background: '#ecfdf5', color: '#166534', borderRadius: 16, border: '1px solid #bbf7d0', lineHeight: 1.5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 999, background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, flexShrink: 0 }}>
                            ✓
                          </div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800 }}>Password reset successful</div>
                            <div style={{ fontSize: 13, color: '#166534' }}>{passwordSuccess}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {!passwordSuccess ? (
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', padding: '20px 24px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', marginTop: 16 }}>
                    <button type="button" className="secondary-button" onClick={closePasswordModal}>
                      Cancel
                    </button>
                    <button type="button" disabled={passwordSaving} className="primary-button" onClick={handlePasswordSubmit}>
                      {passwordSaving ? 'Updating...' : 'Update password'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 24px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', marginTop: 16 }}>
                    <button type="button" className="primary-button" onClick={handlePasswordLogout}>
                      Logout now
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
      <style jsx>{`
        .profile-page-shell {
          padding: 10px 14px 18px;
        }

        .profile-header-row {
          min-width: 0;
        }

        .profile-header-identity {
          min-width: 0;
        }

        .profile-name {
          white-space: normal;
        }

        .profile-designation {
          white-space: normal;
        }

        .profile-tabs-row {
          grid-template-columns: 1fr auto;
        }

        .profile-tabs {
          min-width: 0;
        }

        .profile-tab-button {
          flex: 1 1 auto;
        }

        .profile-content-grid {
          min-width: 0;
        }

        .profile-summary-card {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        @media (max-width: 576px) {
          .profile-page-shell {
            padding: 10px 8px 16px;
          }

          .profile-page-panel {
            border-radius: 14px !important;
          }

          .profile-header-row {
            padding: 12px 14px 10px !important;
          }

          .profile-header-identity {
            width: 100%;
            align-items: flex-start;
          }

          .profile-header-identity img,
          .profile-header-identity > div:last-child {
            width: auto;
          }

          .profile-name {
            white-space: normal;
            overflow: visible;
            text-overflow: unset;
          }

          .profile-edit-button,
          .profile-password-button {
            width: 100%;
          }

          .profile-tabs-row {
            grid-template-columns: 1fr;
            padding: 10px 12px 0 !important;
          }

          .profile-tabs {
            width: 100%;
            display: grid !important;
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .profile-tab-button {
            width: 100%;
            min-width: 0;
          }

          .profile-content-grid {
            grid-template-columns: 1fr !important;
            padding: 12px !important;
          }

          .profile-summary-card {
            padding: 12px !important;
          }

          .profile-edit-modal,
          .profile-password-modal {
            width: min(100%, 100%) !important;
            max-width: 100% !important;
            margin: 0 auto;
            border-radius: 16px !important;
          }

          .profile-modal-layer {
            padding: 12px !important;
          }
        }
      `}</style>
    </main>
  );
}
