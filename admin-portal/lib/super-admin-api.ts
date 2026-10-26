import axios from 'axios';
import { getSAToken, clearSASession, touchSAActivity } from './super-admin-auth';
import { isSilentRequest, markSessionExpired, recordServerTime } from './session-expiry';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const saApi = axios.create({ baseURL: BASE });

saApi.interceptors.request.use((config) => {
  const token = getSAToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  touchSAActivity();
  return config;
});

saApi.interceptors.response.use(
  (res) => { recordServerTime(res.headers?.date); return res; },
  (err) => {
    recordServerTime(err.response?.headers?.date);
    const status = err.response?.status;
    if ((status === 401 || status === 403) && !isSilentRequest(err.config?.headers)) {
      clearSASession();
      if (status === 401) markSessionExpired();
      if (typeof window !== 'undefined') window.location.href = '/super-admin/login';
    }
    return Promise.reject(err);
  }
);
