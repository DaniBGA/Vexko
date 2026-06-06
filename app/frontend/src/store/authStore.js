// src/store/authStore.js
import { create } from 'zustand';
import { api } from '../lib/api.js';
import { queryClient } from '../lib/queryClient.js';

const LOGIN_ERROR_KEY = 'loginError';

function readLoginError() {
  return sessionStorage.getItem(LOGIN_ERROR_KEY) || '';
}

function writeLoginError(message) {
  if (message) {
    sessionStorage.setItem(LOGIN_ERROR_KEY, message);
  } else {
    sessionStorage.removeItem(LOGIN_ERROR_KEY);
  }
}

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,
  loginError: readLoginError(),

  login: async (email, password) => {
    set({ isLoading: true, loginError: '' });
    writeLoginError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      writeLoginError('');
      queryClient.clear();
      set({ user: data.user, token: data.token, isLoading: false, loginError: '' });
      return true;
    } catch (error) {
      const message = error.response?.data?.error || 'No se pudo iniciar sesión';
      writeLoginError(message);
      set({ isLoading: false, loginError: message });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    writeLoginError('');
    queryClient.clear();
    set({ user: null, token: null, loginError: '' });
  },

  fetchMe: async () => {
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, loginError: readLoginError() });
    } catch {
      localStorage.removeItem('token');
      writeLoginError('');
      queryClient.clear();
      set({ user: null, token: null, loginError: '' });
    }
  },
}));
