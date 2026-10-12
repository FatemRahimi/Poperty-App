/**
 * Auth pages historically expected React Router's location object
 * (`{ pathname }`), while Property Intelligence / ProtectedRoute pass a
 * string path. Google OAuth must start on the API host so the session
 * cookie matches `/api/auth/google/callback`.
 */

const DEFAULT_RETURN_PATH = '/find';

export function safeFrontendPath(value, fallback = DEFAULT_RETURN_PATH) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
  if (trimmed.includes('://') || trimmed.includes('\\')) return fallback;
  return trimmed;
}

export function resolveAuthReturnPath(from, fallback = DEFAULT_RETURN_PATH) {
  if (typeof from === 'string') {
    return safeFrontendPath(from, fallback);
  }
  if (from && typeof from === 'object') {
    const pathname = typeof from.pathname === 'string' ? from.pathname : '';
    const search = typeof from.search === 'string' ? from.search : '';
    const combined = `${pathname}${search}`;
    return safeFrontendPath(combined || fallback, fallback);
  }
  return fallback;
}

export function googleAuthStartUrl(returnPath, backendUrl = process.env.REACT_APP_BACKEND_URL) {
  const envBase = typeof backendUrl === 'string' ? backendUrl.trim().replace(/\/$/, '') : '';
  // Google's callback is registered on the API host, so the start URL must
  // hit that host too. Relative `/api/...` via the CRA proxy would set the
  // session cookie on :3000 and lose it on the :5050 callback.
  const base = envBase || 'http://localhost:5050';
  const redirectTo = encodeURIComponent(safeFrontendPath(returnPath));
  return `${base}/api/auth/google?redirectTo=${redirectTo}`;
}
