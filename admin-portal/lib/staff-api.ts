import axios from 'axios';
import { isSilentRequest, markSessionExpired } from './session-expiry';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// A real shared instance, not a new axios.create() per call — the previous
// pattern (a staffApi() function called fresh each time) had no response
// interceptor at all, so a genuinely expired token just failed silently on
// every request with no redirect and no explanation, instead of either of
// the other portals' behaviors.
export const staffApi = axios.create({ baseURL: BASE, timeout: 15000 });

staffApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cas_st_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

staffApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined' && !isSilentRequest(err.config?.headers)) {
      localStorage.removeItem('cas_st_token');
      localStorage.removeItem('cas_st_user');
      markSessionExpired();
      window.location.href = '/staff-portal/login';
    }
    return Promise.reject(err);
  }
);
