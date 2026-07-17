import { create } from 'zustand';

export interface User {
  id: number;
  name: string;
  username: string;
  role: string;
  statut: string;
}

interface AppStore {
  user: User | null;
  setUser: (u: User | null) => void;
  toast: { message: string; type: 'success' | 'error' | 'warning' } | null;
  showToast: (message: string, type: 'success' | 'error' | 'warning') => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  toast: null,
  showToast: (message, type) => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },
}));
