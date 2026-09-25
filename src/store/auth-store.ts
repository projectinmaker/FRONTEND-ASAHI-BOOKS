import { create } from 'zustand';
import { api, setToken, ApiError } from '@/lib/api';
import type { UserResponse, LoginResponse } from '@/types/api';

interface AuthState {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  initAdmin: () => Promise<void>;
  setUser: (user: UserResponse) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: getUser(),
  isAuthenticated: !!getToken(),
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const res = await api.post<LoginResponse>('/auth/login', { username, password });
      setToken(res.accessToken);
      setUserStorage(res.user);
      set({ user: res.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    setToken(null);
    setUserStorage(null);
    set({ user: null, isAuthenticated: false });
  },

  initAdmin: async () => {
    try {
      await api.post('/auth/init-admin');
    } catch (err) {
      // 400 = admin sudah ada, itu OK
      if (err instanceof ApiError && err.status === 400) return;
      throw err;
    }
  },

  setUser: (user) => {
    setUserStorage(user);
    set({ user });
  }
}));

// Helper — baca token dari localStorage (dipakai saat init)
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('asahi_erp_token');
}

// Helper — baca user dari localStorage (dipakai saat init, untuk restore session)
function getUser(): UserResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('asahi_erp_user');
    return raw ? (JSON.parse(raw) as UserResponse) : null;
  } catch {
    return null;
  }
}

// Helper — simpan user ke localStorage
function setUserStorage(user: UserResponse | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem('asahi_erp_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('asahi_erp_user');
  }
}

// Listener untuk event 401 dari api.ts
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.getState().logout();
  });
}
