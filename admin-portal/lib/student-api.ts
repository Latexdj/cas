import axios from 'axios';
import { isSilentRequest, markSessionExpired } from './session-expiry';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const studentApi = axios.create({ baseURL: BASE, timeout: 15000 });

studentApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cas_s_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

studentApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined' && !isSilentRequest(err.config?.headers)) {
      localStorage.removeItem('cas_s_token');
      localStorage.removeItem('cas_s_user');
      markSessionExpired();
      window.location.href = '/student/login';
    }
    return Promise.reject(err);
  }
);
