'use client';

import AttendancePolicyEditor from '@/components/AttendancePolicyEditor';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, FeedbackToast } from '@/components/Feedback';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { fetchStores } from '@/lib/admin-data';
import { apiFetchWithRetry } from '@/lib/api';
import { hasITAdminAccess } from '@/lib/utils';

type Store = {
  id: string | number;
  name: string;
  city: string;
  locality: string;
  district: string;
  pinCode: string;
  localBody: string;
  type: string;
  status: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  locationName?: string;
  isDeleted: boolean;
};
type SelectOption = { id: string; value: string; label: string };
type StoreOptionInput = string | SelectOption | null | undefined;
type StoreFormState = {
  name: string;
  locality: string;
  city: string;
  district: string;
  pinCode: string;
  localBody: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  geocodeQuery: string;
  type: SelectOption;
  status: SelectOption;
};
type StoreFormErrors = Partial<Record<keyof StoreFormState, string>>;

const EMPTY_SELECT_OPTION: SelectOption = { id: '', value: '', label: '' };

const toSelectOption = (options: SelectOption[], value: StoreOptionInput, fallback?: SelectOption): SelectOption => {
  if (typeof value === 'object' && value) {
    const objectValue = value.value ?? value.label ?? '';
    return options.find((option) => option.value === objectValue) ?? fallback ?? options[0] ?? { id: '', value: '', label: '' };
  }

  const stringValue = String(value ?? '').trim();
  return options.find((option) => option.value === stringValue) ?? fallback ?? options[0] ?? { id: '', value: '', label: '' };
};

const initialStores: Store[] = [];

const storeTypeOptions: SelectOption[] = [
  { id: 'corporate', value: 'Corporate', label: 'Corporate' },
  { id: 'retail', value: 'Retail', label: 'Retail' },
  { id: 'warehouse', value: 'Warehouse', label: 'Warehouse' },
  { id: 'distribution', value: 'Distribution', label: 'Distribution' },
];

const storeStatusOptions: SelectOption[] = [
  { id: 'new-setup', value: 'New Setup', label: 'New Setup' },
  { id: 'operational', value: 'Operational', label: 'Operational' },
  { id: 'maintenance', value: 'Maintenance', label: 'Maintenance' },
  { id: 'closed', value: 'Closed', label: 'Closed' },
];

const emptyStoreForm: StoreFormState = {
  name: '',
  locality: '',
  city: '',
  district: '',
  pinCode: '',
  localBody: '',
  latitude: '',
  longitude: '',
  radiusMeters: '100',
  geocodeQuery: '',
  type: EMPTY_SELECT_OPTION,
  status: EMPTY_SELECT_OPTION,
};

const validateStoreForm = (values: StoreFormState): StoreFormErrors => {
  const errors: StoreFormErrors = {};

  if (!values.name.trim()) errors.name = 'Store name is required.';
  if (!values.locality.trim()) errors.locality = 'Locality is required.';
  if (!values.city.trim()) errors.city = 'City is required.';
  if (!values.district.trim()) errors.district = 'District is required.';
  if (!values.pinCode.trim()) {
    errors.pinCode = 'PIN code is required.';
  } else if (!/^\d{6}$/.test(values.pinCode.trim())) {
    errors.pinCode = 'PIN code must be 6 digits.';
  }
  if (!values.localBody.trim()) errors.localBody = 'Local body is required.';
  if (!values.type?.value?.trim()) errors.type = 'Store type is required.';
  if (!values.status?.value?.trim()) errors.status = 'Status is required.';

  return errors;
};

const resolveOption = (options: SelectOption[], value: string | undefined, fallback?: SelectOption) =>
  options.find((option) => option.value === value) ?? fallback ?? options[0] ?? { id: '', value: '', label: '' };

const iconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

export default function StoresPage() {
  const [stores, setStores] = useState(initialStores);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'location' | 'type' | 'status'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [pendingDeleteStore, setPendingDeleteStore] = useState<(typeof initialStores)[number] | null>(null);
  const [isDeletingStore, setIsDeletingStore] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' } | null>(null);
  const [isGeoLoading, setIsGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ label: string; latitude: number; longitude: number }>>([]);
  const [isSuggestionSelected, setIsSuggestionSelected] = useState(false);
  const suggestionRequestIdRef = useRef(0);
  const [form, setForm] = useState<StoreFormState>({
    ...emptyStoreForm,
  });
  const [formErrors, setFormErrors] = useState<StoreFormErrors>({});

  const currentUserRole = useMemo(() => {
    if (typeof window === 'undefined') return '';

    try {
      const storedUser = JSON.parse(window.sessionStorage.getItem('loop_admin_user') ?? '{}');
      return String(storedUser?.role ?? '');
    } catch {
      return '';
    }
  }, []);

  const canViewDeletedRecords = hasITAdminAccess(currentUserRole);

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (store.isDeleted && !canViewDeletedRecords) {
        return false;
      }

      const matchesQuery =
        query.trim().length === 0 ||
        store.name.toLowerCase().includes(query.toLowerCase()) ||
        store.city.toLowerCase().includes(query.toLowerCase());

      const matchesType = selectedType === 'All' || store.type === selectedType;
      return matchesQuery && matchesType;
    });
  }, [query, selectedType, stores, canViewDeletedRecords]);

  const sortedStores = useMemo(() => {
    const locationLabel = (store: Store) => [store.locality, store.city].filter(Boolean).join(', ') || store.city || '';

    return [...filteredStores].sort((first, second) => {
      const firstValue = sortBy === 'location' ? locationLabel(first) : first[sortBy];
      const secondValue = sortBy === 'location' ? locationLabel(second) : second[sortBy];
      const comparison = String(firstValue ?? '').localeCompare(String(secondValue ?? ''), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredStores, sortBy, sortDirection]);

  const handleSort = (column: 'name' | 'location' | 'type' | 'status') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'name' | 'location' | 'type' | 'status') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const showToast = useCallback((description: string, type: 'success' | 'error' = 'success', title?: string) => {
    setToast({
      type,
      title: title ?? (type === 'success' ? 'Success' : 'Error'),
      description,
    });
  }, []);

  const parseRadiusValue = (value: string) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const reverseGeocodeLocation = useCallback(async (latitude: number, longitude: number) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const geocodeUrl = apiKey
      ? `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${encodeURIComponent(apiKey)}`
      : `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;

    try {
      const response = await fetch(geocodeUrl, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Reverse geocoding failed.');
      }

      const payload = await response.json();
      const addressName = apiKey
        ? payload?.results?.[0]?.formatted_address
        : payload?.display_name;

      const safeName = typeof addressName === 'string' && addressName.trim() ? addressName.trim() : '';
      if (safeName) {
        setIsSuggestionSelected(true);
        setForm((current) => ({
          ...current,
          geocodeQuery: safeName,
        }));
      }
    } catch {
      setGeoError('Unable to resolve the selected location name. You can still keep the coordinates and address values manually.');
    }
  }, []);

  const updateGeoCoordinates = useCallback((latitude: number, longitude: number, locationName?: string) => {
    const nextLocationName = locationName?.trim();

    setForm((current) => ({
      ...current,
      latitude: Number.isFinite(latitude) ? latitude.toFixed(6) : '',
      longitude: Number.isFinite(longitude) ? longitude.toFixed(6) : '',
      geocodeQuery: nextLocationName || current.geocodeQuery,
    }));

    if (nextLocationName) {
      return;
    }

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      void reverseGeocodeLocation(latitude, longitude);
    }

    setGeoError('');
  }, [reverseGeocodeLocation]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !document.getElementById('store-location-search')) {
      return;
    }

    const initAutocomplete = () => {
      const input = document.getElementById('store-location-search') as HTMLInputElement | null;
      if (!input || typeof window === 'undefined' || !(window as any).google?.maps?.places) {
        return;
      }

      const autocomplete = new (window as any).google.maps.places.Autocomplete(input, {
        types: ['geocode', 'establishment'],
        fields: ['formatted_address', 'geometry', 'name', 'place_id'],
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const locationName = place?.formatted_address || place?.name || '';
        const lat = place?.geometry?.location?.lat?.();
        const lng = place?.geometry?.location?.lng?.();

        if (typeof lat === 'number' && typeof lng === 'number') {
          updateGeoCoordinates(lat, lng, locationName || form.geocodeQuery);
        }

        if (locationName) {
          setForm((current) => ({ ...current, geocodeQuery: locationName }));
        }
      });
    };

    if ((window as any).google?.maps?.places) {
      initAutocomplete();
      return;
    }

    const scriptId = 'google-places-autocomplete-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => initAutocomplete();
      document.head.appendChild(script);
    }
  }, [form.geocodeQuery, updateGeoCoordinates]);

  const handleDetectLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError('Geolocation is not supported on this browser.');
      return;
    }

    setIsGeoLoading(true);
    setGeoError('');
    setLocationSuggestions([]);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsSuggestionSelected(true);
        setForm((current) => ({
          ...current,
          geocodeQuery: current.geocodeQuery || 'Current location',
        }));
        updateGeoCoordinates(position.coords.latitude, position.coords.longitude, 'Current location');
        setIsGeoLoading(false);
      },
      () => {
        setGeoError('Unable to detect your current location. You can still enter coordinates manually.');
        setIsGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 },
    );
  }, [updateGeoCoordinates]);

  const fetchLocationSuggestions = useCallback(async (queryText: string) => {
    const trimmedQuery = queryText.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setLocationSuggestions([]);
      return;
    }

    const requestId = Date.now() + Math.random();
    suggestionRequestIdRef.current = requestId;

    try {
      const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const endpoint = googleApiKey
        ? `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmedQuery)}&key=${encodeURIComponent(googleApiKey)}`
        : `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(trimmedQuery)}`;

      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Location suggestion lookup failed.');
      }

      const payload = await response.json();
      const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];

      const suggestions = results
        .map((result: any) => {
          const label = String(result?.formatted_address ?? result?.display_name ?? result?.name ?? '').trim();
          const latitude = Number(result?.geometry?.location?.lat ?? result?.lat ?? result?.latitude ?? 0);
          const longitude = Number(result?.geometry?.location?.lng ?? result?.lon ?? result?.longitude ?? 0);

          if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }

          return {
            label,
            latitude,
            longitude,
          };
        })
        .filter(Boolean) as Array<{ label: string; latitude: number; longitude: number }>;

      if (requestId !== suggestionRequestIdRef.current) {
        return;
      }

      setLocationSuggestions(suggestions.slice(0, 5));
    } catch {
      if (requestId !== suggestionRequestIdRef.current) {
        return;
      }
      setLocationSuggestions([]);
    }
  }, []);

  const handleLocationInputChange = useCallback((value: string) => {
    setIsSuggestionSelected(false);
    setForm((current) => ({ ...current, geocodeQuery: value }));
    if (!value.trim()) {
      setLocationSuggestions([]);
      return;
    }

    void fetchLocationSuggestions(value);
  }, [fetchLocationSuggestions]);

  const handleSearchLocation = useCallback(async () => {
    const queryText = form.geocodeQuery.trim();
    if (!queryText) {
      setGeoError('Enter a location name or address to search.');
      return;
    }

    setIsGeoLoading(true);
    setGeoError('');

    try {
      const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const endpoint = googleApiKey
        ? `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(queryText)}&key=${encodeURIComponent(googleApiKey)}`
        : `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(queryText)}`;

      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Location lookup failed.');
      }

      const payload = await response.json();
      const result = Array.isArray(payload?.results) ? payload.results[0] : Array.isArray(payload) ? payload[0] : null;
      const latitude = Number(result?.geometry?.location?.lat ?? result?.lat ?? result?.latitude ?? 0);
      const longitude = Number(result?.geometry?.location?.lng ?? result?.lon ?? result?.longitude ?? 0);
      const locationName = String(result?.formatted_address ?? result?.display_name ?? result?.name ?? queryText).trim();

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) {
        throw new Error('No matching location found for this search.');
      }

      updateGeoCoordinates(latitude, longitude, locationName || queryText);
      setIsSuggestionSelected(true);
      setForm((current) => ({
        ...current,
        geocodeQuery: locationName || queryText,
      }));
      setLocationSuggestions([]);
    } catch {
      setGeoError('No result was found for that location. Try a more specific address or enter coordinates manually.');
    } finally {
      setIsGeoLoading(false);
    }
  }, [form.geocodeQuery, updateGeoCoordinates]);

  const loadStores = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const rows = await fetchStores();
      setStores(rows);
    } catch {
      setHasError(true);
      showToast('Failed to load stores after 3 attempts. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const handleSubmit = async () => {
    const nextErrors = validateStoreForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showToast('Please complete all required store fields.', 'error');
      return;
    }

    const nextType = form.type?.value ?? '';
    const nextStatus = form.status?.value ?? '';
    const latitudeValue = Number(form.latitude);
    const longitudeValue = Number(form.longitude);
    const radiusValue = parseRadiusValue(form.radiusMeters);

    if (form.latitude.trim() && (!Number.isFinite(latitudeValue) || latitudeValue < -90 || latitudeValue > 90)) {
      showToast('Latitude must be a valid value between -90 and 90.', 'error');
      return;
    }

    if (form.longitude.trim() && (!Number.isFinite(longitudeValue) || longitudeValue < -180 || longitudeValue > 180)) {
      showToast('Longitude must be a valid value between -180 and 180.', 'error');
      return;
    }

    if (!Number.isFinite(radiusValue) || radiusValue < 0) {
      showToast('Geofence radius must be a valid distance in meters.', 'error');
      return;
    }

    const normalizedStore = {
      name: form.name.trim(),
      locality: form.locality.trim(),
      city: form.city.trim(),
      district: form.district.trim(),
      pinCode: form.pinCode.trim(),
      localBody: form.localBody.trim(),
      latitude: form.latitude.trim() ? latitudeValue : undefined,
      longitude: form.longitude.trim() ? longitudeValue : undefined,
      radiusMeters: radiusValue,
      locationName: form.geocodeQuery.trim() || undefined,
      type: nextType,
      status: nextStatus,
    };

    setIsSavingStore(true);

    try {
      if (editingId !== null) {
        const storeId = String(editingId ?? '').trim();

        if (!storeId) {
          showToast('Invalid store record. Please refresh and try again.', 'error');
          return;
        }

        await apiFetchWithRetry(`/stores/${encodeURIComponent(storeId)}`, {
          method: 'PATCH',
          body: JSON.stringify(normalizedStore),
        });

        await loadStores();

        showToast('Store updated successfully.', 'success');
      } else {
        await apiFetchWithRetry('/stores', {
          method: 'POST',
          body: JSON.stringify(normalizedStore),
        });

        await loadStores();
        showToast('Store added successfully.', 'success');
      }

      setForm({ ...emptyStoreForm });
      setFormErrors({});
      setEditingId(null);
      setShowStoreModal(false);
    } catch {
      showToast(editingId !== null ? 'Failed to update store. Please try again.' : 'Failed to add store. Please try again.', 'error');
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleEdit = (store: (typeof initialStores)[number]) => {
    setEditingId(store.id);
    setForm({
      name: store.name,
      locality: store.locality ?? '',
      city: store.city,
      district: store.district ?? '',
      pinCode: store.pinCode ?? '',
      localBody: store.localBody ?? '',
      latitude: store.latitude != null ? String(store.latitude) : '',
      longitude: store.longitude != null ? String(store.longitude) : '',
      radiusMeters: store.radiusMeters != null ? String(store.radiusMeters) : '100',
      geocodeQuery: store.locationName ?? '',
      type: toSelectOption(storeTypeOptions, store.type, EMPTY_SELECT_OPTION),
      status: toSelectOption(storeStatusOptions, store.status, EMPTY_SELECT_OPTION),
    });
    setFormErrors({});
    setShowStoreModal(true);
  };

  const handleDelete = (store: (typeof initialStores)[number]) => {
    setPendingDeleteStore(store);
  };

  const confirmDeleteStore = async () => {
    if (!pendingDeleteStore) {
      showToast('No store selected for deletion.', 'error', 'Delete failed');
      return;
    }

    const deletedStoreName = pendingDeleteStore.name;

    setIsDeletingStore(true);

    try {
      const storeId = String(pendingDeleteStore.id ?? '').trim();

      if (!storeId) {
        showToast('Invalid store record. Please refresh and try again.', 'error', 'Delete failed');
        return;
      }

      await apiFetchWithRetry(`/stores/${encodeURIComponent(storeId)}`, {
        method: 'DELETE',
      });

      await loadStores();
      showToast(`${deletedStoreName} has been removed from active store records.`, 'success', 'Store deleted');

      setPendingDeleteStore(null);
    } catch {
      showToast('Failed to delete store. Please try again.', 'error', 'Delete failed');
    } finally {
      setIsDeletingStore(false);
    }
  };

  return (
    <main className="portal-page">
      {toast && <FeedbackToast title={toast.title} description={toast.description} type={toast.type} onClose={() => setToast(null)} durationMs={2800} />}
      <ConfirmDialog
        open={Boolean(pendingDeleteStore)}
        title="Delete store?"
        description={pendingDeleteStore ? <>Are you sure you want to delete <strong>{pendingDeleteStore.name}</strong>?</> : ''}
        confirmLabel="Delete store"
        isProcessing={isDeletingStore}
        onCancel={() => setPendingDeleteStore(null)}
        onConfirm={() => void confirmDeleteStore()}
      />

      {showStoreModal && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(760px, 100vw)', zIndex: 60, display: 'flex', flexDirection: 'column', background: '#f8fafc', borderLeft: '1px solid #e2e8f0', boxShadow: '-20px 0 60px rgba(15, 23, 42, 0.16)' }}>
          <div className="card" style={{ width: '100%', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc', borderRadius: 0, boxShadow: 'none', border: 'none', borderLeft: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 14px', borderBottom: '1px solid rgba(148,163,184,0.2)', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.96)', zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.03em' }}>{editingId ? 'Edit store' : 'Add new store'}</h2>
              <button type="button" onClick={() => { setShowStoreModal(false); setEditingId(null); setForm({ ...emptyStoreForm }); setFormErrors({}); }} style={{ border: 'none', background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#475569', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            <div style={{ display: 'grid', gap: 14, padding: '24px 24px 0', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Store name
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.name ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.name && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.name}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Locality
                <input value={form.locality} onChange={(event) => setForm((current) => ({ ...current, locality: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.locality ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.locality && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.locality}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                City
                <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.city ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.city && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.city}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                District
                <input value={form.district} onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.district ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.district && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.district}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Pin code
                <input value={form.pinCode} onChange={(event) => setForm((current) => ({ ...current, pinCode: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.pinCode ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.pinCode && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.pinCode}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Municipality / Panchayat / Corporation
                <input value={form.localBody} onChange={(event) => setForm((current) => ({ ...current, localBody: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.localBody ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.localBody && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.localBody}</span>}
              </label>

              <div style={{ display: 'grid', gap: 10, border: '1px solid rgba(148,163,184,0.25)', borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Geo location</div>
                  <button type="button" onClick={handleDetectLocation} disabled={isGeoLoading} style={{ padding: '8px 10px', borderRadius: 8, background: '#e0f2fe', color: '#075985', border: 'none', fontWeight: 700, cursor: isGeoLoading ? 'not-allowed' : 'pointer', opacity: isGeoLoading ? 0.7 : 1 }}>
                    {isGeoLoading ? 'Detecting...' : 'Use my location'}
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 6, color: '#475569', fontWeight: 700 }}>
                    Search location name or address
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input id="store-location-search" value={form.geocodeQuery} onChange={(event) => handleLocationInputChange(event.target.value)} placeholder="Search nearby shop name, landmark or address" style={{ flex: 1, minWidth: 180, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }} />
                        <button type="button" onClick={() => void handleSearchLocation()} style={{ padding: '10px 12px', borderRadius: 10, background: '#0f172a', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                          Search
                        </button>
                      </div>

                      {locationSuggestions.length > 0 && (
                        <div style={{ display: 'grid', gap: 4, border: '1px solid rgba(148,163,184,0.25)', borderRadius: 10, background: '#fff', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
                          {locationSuggestions.map((suggestion) => (
                            <button
                              key={`${suggestion.label}-${suggestion.latitude}-${suggestion.longitude}`}
                              type="button"
                              onClick={() => {
                                setIsSuggestionSelected(true);
                                setForm((current) => ({ ...current, geocodeQuery: suggestion.label }));
                                updateGeoCoordinates(suggestion.latitude, suggestion.longitude, suggestion.label);
                                setLocationSuggestions([]);
                              }}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 12px',
                                border: 'none',
                                background: 'white',
                                color: '#0f172a',
                                cursor: 'pointer',
                                fontSize: 14,
                              }}
                            >
                              {suggestion.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <label style={{ display: 'grid', gap: 6, color: '#475569', fontWeight: 700 }}>
                    Latitude
                    <input value={form.latitude} onChange={(event) => {
                      const nextLatitude = event.target.value;
                      setForm((current) => ({ ...current, latitude: nextLatitude }));

                      const latitudeValue = Number(nextLatitude);
                      const longitudeValue = Number(form.longitude);

                      if (Number.isFinite(latitudeValue) && Number.isFinite(longitudeValue) && Math.abs(latitudeValue) <= 90 && Math.abs(longitudeValue) <= 180) {
                        void reverseGeocodeLocation(latitudeValue, longitudeValue);
                      }
                    }} placeholder="12.9716" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }} />
                  </label>

                  <label style={{ display: 'grid', gap: 6, color: '#475569', fontWeight: 700 }}>
                    Longitude
                    <input value={form.longitude} onChange={(event) => {
                      const nextLongitude = event.target.value;
                      setForm((current) => ({ ...current, longitude: nextLongitude }));

                      const latitudeValue = Number(form.latitude);
                      const longitudeValue = Number(nextLongitude);

                      if (Number.isFinite(latitudeValue) && Number.isFinite(longitudeValue) && Math.abs(latitudeValue) <= 90 && Math.abs(longitudeValue) <= 180) {
                        void reverseGeocodeLocation(latitudeValue, longitudeValue);
                      }
                    }} placeholder="77.5946" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }} />
                  </label>

                  <label style={{ display: 'grid', gap: 6, color: '#475569', fontWeight: 700 }}>
                    Geofence radius (meters)
                    <input type="number" min="0" step="10" value={form.radiusMeters} onChange={(event) => setForm((current) => ({ ...current, radiusMeters: event.target.value }))} placeholder="100" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }} />
                  </label>
                </div>

                {geoError && <div style={{ color: '#b91c1c', fontSize: 12 }}>{geoError}</div>}
                <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>This geofence is used to allow mobile check-in only when users are physically present at the shop location. If they are outside the premises, the app will prompt: “Please be present on shop to login.”</div>
              </div>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Store type
                <select value={form.type?.value ?? ''} onChange={(event) => setForm((current) => ({ ...current, type: toSelectOption(storeTypeOptions, event.target.value, EMPTY_SELECT_OPTION) }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.type ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }}>
                  <option value="">Select</option>
                  {storeTypeOptions.map((type) => (
                    <option key={type.id} value={type.value}>{type.label}</option>
                  ))}
                </select>
                {formErrors.type && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.type}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Status
                <select value={form.status?.value ?? ''} onChange={(event) => setForm((current) => ({ ...current, status: toSelectOption(storeStatusOptions, event.target.value, EMPTY_SELECT_OPTION) }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.status ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }}>
                  <option value="">Select</option>
                  {storeStatusOptions.map((status) => (
                    <option key={status.id} value={status.value}>{status.label}</option>
                  ))}
                </select>
                {formErrors.status && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.status}</span>}
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-start', padding: '18px 24px 24px', marginTop: 8, borderTop: '1px solid rgba(148,163,184,0.2)', position: 'sticky', bottom: 0, background: 'rgba(255,255,255,0.96)', zIndex: 1 }}>
              <button type="button" onClick={() => void handleSubmit()} disabled={isSavingStore} style={{ padding: '10px 16px', borderRadius: 10, background: '#111827', color: '#fff', border: 'none', cursor: isSavingStore ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSavingStore ? 0.7 : 1 }}>
                {isSavingStore ? (editingId ? 'Updating...' : 'Adding...') : (editingId ? 'Update store' : 'Add store')}
              </button>

              <button type="button" onClick={() => { setEditingId(null); setShowStoreModal(false); setForm({ ...emptyStoreForm }); setFormErrors({}); }} style={{ padding: '10px 16px', borderRadius: 10, background: '#e2e8f0', color: '#0f172a', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search store, city or manager"
              style={{ minWidth: 260, height: 42, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)', color: '#0f172a', fontSize: 15 }}
            />

            <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)} style={{ height: 42, minWidth: 160, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)', color: '#0f172a', fontSize: 15 }}>
              <option value="All">All Types</option>
              {storeTypeOptions.map((type) => (
                <option key={type.id} value={type.value}>{type.label}</option>
              ))}
            </select>

          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => void loadStores()} style={{ padding: '10px 16px', background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" onClick={() => { setEditingId(null); setForm({ ...emptyStoreForm }); setShowStoreModal(true); }} style={{ padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              + Add Store
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {isLoading ? (
            <TableSkeleton columns={5} rows={4} />
          ) : hasError ? (
            <EmptyState variant="error" onRetry={loadStores} />
          ) : (
            <table className="table" style={{ minWidth: 700, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px' }}>
                    <button type="button" onClick={() => handleSort('name')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Store {getSortArrow('name')}
                    </button>
                  </th>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px' }}>
                    <button type="button" onClick={() => handleSort('location')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Location {getSortArrow('location')}
                    </button>
                  </th>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px' }}>
                    <button type="button" onClick={() => handleSort('type')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Type {getSortArrow('type')}
                    </button>
                  </th>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px' }}>
                    <button type="button" onClick={() => handleSort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Status {getSortArrow('status')}
                    </button>
                  </th>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px', position: 'sticky', right: 0, background: '#fff', zIndex: 2 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedStores.length > 0 ? (
                  sortedStores.map((store) => {
                    const location = [store.locality, store.city].filter(Boolean).join(', ') || store.city || '—';

                    return (
                      <tr key={store.id}>
                        <td style={{ padding: '16px 12px', color: '#0f172a', fontWeight: 600 }}>{store.name}</td>
                        <td style={{ padding: '16px 12px', color: '#475569' }}>{location}</td>
                        <td style={{ padding: '16px 12px', color: '#475569' }}>{store.type}</td>
                        <td style={{ padding: '16px 12px' }}><span className={`badge ${store.status === 'Operational' ? 'success' : store.status === 'New Setup' ? 'info' : 'warning'}`}>{store.status}</span></td>
                        <td style={{ padding: '16px 12px', position: 'sticky', right: 0, background: '#fff', zIndex: 1 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 92 }}>
                            <AttendancePolicyEditor scope="shop" profileId={String(store.id)} name={store.name} />
                            <button type="button" aria-label={`Edit ${store.name}`} title="Edit store" onClick={() => handleEdit(store)} style={{ ...iconButtonStyle, background: '#dbeafe', color: '#1d4ed8' }}>
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                              </svg>
                            </button>
                            <button type="button" aria-label={`Delete ${store.name}`} title="Delete store" onClick={() => handleDelete(store)} style={{ ...iconButtonStyle, background: '#fee2e2', color: '#991b1b', borderColor: 'rgba(239,68,68,0.35)' }}>
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <EmptyState colSpan={5} title="No stores found" description="No stores match the current search or filters." />
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
