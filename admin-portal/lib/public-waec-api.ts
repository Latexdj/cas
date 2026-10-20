import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// Dedicated client for the public WAEC account flow — deliberately not the
// shared publicApi (no auth header, used by the unrelated admissions portal)
// nor retrofitted onto it, so neither consumer has to reason about the other.
export const publicWaecApi = axios.create({ baseURL: BASE, timeout: 20000 });

publicWaecApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cas_pwaec_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

publicWaecApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('cas_pwaec_token');
      localStorage.removeItem('cas_pwaec_user');
      window.location.href = '/public-waec-results/account/login';
    }
    return Promise.reject(err);
  }
);
