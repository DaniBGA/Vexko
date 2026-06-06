import { create } from 'zustand';
import { adminApi } from '../lib/adminApi.js';
import { queryClient } from '../lib/queryClient.js';

export const useAdminAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('adminToken'),
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await adminApi.post('/admin/login', { email, password });
      localStorage.setItem('adminToken', data.token);
      queryClient.clear();
      set({ user: data.user, token: data.token, isLoading: false });
      return true;
    } catch {
      set({ isLoading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('adminToken');
    queryClient.clear();
    set({ user: null, token: null });
  },

  fetchMe: async () => {
    try {
      const { data } = await adminApi.get('/admin/me');
      set({ user: data });
    } catch {
      localStorage.removeItem('adminToken');
      queryClient.clear();
      set({ user: null, token: null });
    }
  },
}));