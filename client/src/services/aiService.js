import axios from 'axios';
import {
  configureAiCreditFetcher,
  ingestAiHttpError,
  ingestAiHttpSuccess,
  refreshAiCredits,
} from './aiCreditState';

const resolveApiBaseUrl = () => {
  if (process.env.REACT_APP_BACKEND_URL) return process.env.REACT_APP_BACKEND_URL;
  // CRA dev proxy (package.json) forwards /api/* to the backend when baseURL is empty
  if (process.env.NODE_ENV === 'development') return '';
  return 'http://localhost:5050';
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    ingestAiHttpSuccess(response);
    return response;
  },
  (error) => {
    ingestAiHttpError(error);
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('loginTime');
      window.dispatchEvent(new CustomEvent('auth:session-expired'));
    }
    return Promise.reject(error);
  }
);

configureAiCreditFetcher(async () => {
  const { data } = await api.get('/api/ai/subscription');
  return data;
});

export const AI_PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    blurb: 'Try the AI toolkit with limited generations.',
    features: [
      '3 AI generations per month',
      'Listing Writer (basic)',
      'Buyer Match Assistant',
      'Save generation history',
    ],
    cta: 'Start free',
    highlighted: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 49,
    period: 'month',
    blurb: 'Unlimited descriptions and full marketing suite.',
    features: [
      'Unlimited property descriptions',
      'AI marketing tools',
      'SEO titles & social adverts',
      'Valuation reports',
      'Email marketing copy',
      'Priority generation speed',
    ],
    cta: 'Start Professional',
    highlighted: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 149,
    period: 'month',
    blurb: 'Multi-user workspace with advanced reports.',
    features: [
      'Everything in Professional',
      'Multiple users (up to 10)',
      'Advanced valuation reports',
      'Team usage dashboard',
      'Priority support',
      'Custom branding on reports',
    ],
    cta: 'Start Agency',
    highlighted: false,
  },
];

export async function fetchPlans() {
  const { data } = await api.get('/api/ai/plans');
  return data;
}

export async function fetchSubscription() {
  return refreshAiCredits();
}

export async function upgradePlan(plan) {
  const { data } = await api.post('/api/ai/subscription/upgrade', { plan });
  return data;
}

export async function fetchDashboard() {
  const { data } = await api.get('/api/ai/dashboard');
  return data;
}

export async function fetchHistory(params = {}) {
  const { data } = await api.get('/api/ai/history', { params });
  return data;
}

export async function fetchHistoryItem(id) {
  const { data } = await api.get(`/api/ai/history/${id}`);
  return data;
}

export async function deleteHistoryItem(id) {
  const { data } = await api.delete(`/api/ai/history/${id}`);
  return data;
}

export async function generateListing(payload) {
  const { data } = await api.post('/api/ai/listing-writer', payload);
  return data;
}

export async function generateValuation(payload, files = []) {
  if (files.length) {
    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, value);
    });
    files.forEach((file) => form.append('photos', file));
    const { data } = await api.post('/api/ai/valuation', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }
  const { data } = await api.post('/api/ai/valuation', payload);
  return data;
}

export async function generateBuyerMatch(payload) {
  const { data } = await api.post('/api/ai/buyer-match', payload);
  return data;
}

export async function fetchIntelligenceOverview() {
  const { data } = await api.get('/api/ai/intelligence/overview');
  return data;
}

export async function fetchIntelligenceProperties() {
  const { data } = await api.get('/api/ai/intelligence/properties');
  return data;
}

export async function searchIntelligenceProperties(query, scope = 'mine', savedIds = []) {
  const params = { q: query, scope };
  if (scope === 'saved' && savedIds.length) {
    params.ids = savedIds.join(',');
  }
  const { data } = await api.get('/api/ai/intelligence/properties/search', { params });
  return data;
}

export async function fetchRecentSubjectLookups(limit = 12) {
  const { data } = await api.get('/api/ai/intelligence/subjects/recent', { params: { limit } });
  return data;
}

export async function fetchSubjectPreview(subjectId) {
  const { data } = await api.get(`/api/ai/intelligence/subjects/${subjectId}/preview`);
  return data;
}

export async function fetchSubjectAnalysisHistory(subjectId) {
  const { data } = await api.get(`/api/ai/intelligence/subjects/${subjectId}/history`);
  return data;
}

export async function lookupIntelligenceProperties(query) {
  try {
    const { data } = await api.get('/api/ai/intelligence/lookup', {
      params: { q: query },
      timeout: 45000,
    });
    return data;
  } catch (err) {
    const message =
      err.response?.data?.message ||
      (err.code === 'ECONNABORTED'
        ? 'Search timed out. Check that the backend is running and try again.'
        : !err.response
          ? 'Cannot reach the server. Sign in, ensure the backend is running (port 5050), then retry.'
          : 'UK property lookup failed');
    const wrapped = new Error(message);
    wrapped.response = err.response;
    throw wrapped;
  }
}

export async function resolveIntelligenceSubject({ uprn, address, matchConfidence }) {
  const { data } = await api.post('/api/ai/intelligence/subjects/resolve', {
    uprn,
    address,
    matchConfidence,
  });
  return data;
}

export async function unlinkIntelligenceSubject(subjectId) {
  const { data } = await api.post(`/api/ai/intelligence/subjects/${subjectId}/unlink`);
  return data;
}

export async function analyseSubjectIntelligence(subjectId, options = {}) {
  const { data } = await api.post(`/api/ai/intelligence/subjects/${subjectId}/analyse`, options);
  return data;
}

export async function fetchPropertyPreview(propertyId) {
  const { data } = await api.get(`/api/ai/intelligence/properties/${propertyId}/preview`);
  return data;
}

export async function analysePropertyIntelligence(propertyId, options = {}) {
  const { data } = await api.post(`/api/ai/intelligence/analyse/${propertyId}`, options);
  return data;
}

export async function compareIntelligenceWhatIf(payload) {
  const { data } = await api.post('/api/ai/intelligence/what-if', payload);
  return data;
}

export async function fetchPropertyAnalysisHistory(propertyId) {
  const { data } = await api.get(`/api/ai/intelligence/properties/${propertyId}/history`);
  return data;
}

export async function fetchPropertyAnalysisById(id) {
  const { data } = await api.get(`/api/ai/intelligence/analysis/${id}`);
  return data;
}

export async function fetchLegalEvidence({ propertyId, subjectId } = {}) {
  const { data } = await api.get('/api/ai/intelligence/legal-evidence', {
    params: { propertyId, subjectId },
  });
  return data;
}

export async function uploadLegalEvidence(formData) {
  const { data } = await api.post('/api/ai/intelligence/legal-evidence', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function archiveLegalEvidence(documentId) {
  const { data } = await api.delete(`/api/ai/intelligence/legal-evidence/${documentId}`);
  return data;
}

export function legalEvidenceFileUrl(documentId) {
  return `/api/ai/intelligence/legal-evidence/${documentId}/file`;
}

export async function analyseInvestment(payload) {
  const { data } = await api.post('/api/ai/investment/analyse', payload);
  return data;
}

export async function analyseRent(payload) {
  const { data } = await api.post('/api/ai/rent/analyse', payload);
  return data;
}

export async function analysePortfolio() {
  const { data } = await api.post('/api/ai/portfolio/analyse', {});
  return data;
}

export {
  applyServerCreditState,
  refreshAiCredits,
  subscribeAiCredits,
  displayAiCredits,
  isUnlimitedPlan,
  getAiCreditSnapshot,
} from './aiCreditState';

export default api;
