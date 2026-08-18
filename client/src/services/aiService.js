import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
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
  const { data } = await api.get('/api/ai/subscription');
  return data;
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

export default api;
