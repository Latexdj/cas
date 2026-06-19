import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const principalApi = axios.create({ baseURL: BASE, timeout: 30000 });

principalApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cas_p_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

principalApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('cas_p_token');
      localStorage.removeItem('cas_p_user');
      window.location.href = '/principal/login';
    }
    return Promise.reject(err);
  }
);
