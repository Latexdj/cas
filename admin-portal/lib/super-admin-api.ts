import axios from 'axios';
import { getSAToken, clearSASession, touchSAActivity } from './super-admin-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const saApi = axios.create({ baseURL: BASE });

saApi.interceptors.request.use((config) => {
  const token = getSAToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  touchSAActivity();
  return config;
});

saApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      clearSASession();
      if (typeof window !== 'undefined') window.location.href = '/super-admin/login';
    }
    return Promise.reject(err);
  }
);
