import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// 60s (not 15s) — official profile-update requests attach a supporting
// document as base64 JSON with no client-side compression or size cap, so a
// multi-page scanned certificate on a slow school connection can genuinely
// take longer than 15s to upload. A client-side timeout produces an error
// with no `response` at all, which callers can't distinguish from a real
// failure — see teacher/profile/page.tsx's submitOfficialRequest.
export const teacherApi = axios.create({ baseURL: BASE, timeout: 60000 });

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
