import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const teacherApi = axios.create({ baseURL: BASE, timeout: 15000 });

teacherApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cas_t_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

teacherApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('cas_t_token');
      localStorage.removeItem('cas_t_user');
      window.location.href = '/teacher/login';
    }
    return Promise.reject(err);
  }
);
