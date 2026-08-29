const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000';

let isHandlingUnauthorized = false;

export function handleUnauthorizedSession(message = 'Your session has timed out. Please log in again.') {
  if (typeof window === 'undefined' || isHandlingUnauthorized) {
    return;
  }

  isHandlingUnauthorized = true;
  window.alert(message);
  window.sessionStorage.removeItem('loop_admin_token');
  window.sessionStorage.removeItem('loop_admin_user');
  window.sessionStorage.removeItem('loop_admin_last_activity');
  window.location.href = '/login';
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});

  if (typeof window !== 'undefined') {
    const token = window.sessionStorage.getItem('loop_admin_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    handleUnauthorizedSession('Your session has timed out. Click OK to log in again.');
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

const RETRY_DELAY_MS = 600;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Retries a GET-style apiFetch call up to `retries` attempts before rethrowing the last error. */
export async function apiFetchWithRetry<T>(path: string, options: RequestInit = {}, retries = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await apiFetch<T>(path, options);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await wait(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed after retries');
}
