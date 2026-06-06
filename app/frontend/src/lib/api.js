// src/lib/api.js
import axios from 'axios';
import toast from 'react-hot-toast';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
});

// Inyectar token JWT en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Manejar errores globalmente
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = String(err.config?.url || '').includes('/auth/login');
    const hasAuthHeader = Boolean(err.config?.headers?.Authorization);

    if (err.response?.status === 401 && hasAuthHeader && !isLoginRequest) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    const message = err.response?.data?.error || 'Error de conexión';
    toast.error(message);
    return Promise.reject(err);
  }
);
