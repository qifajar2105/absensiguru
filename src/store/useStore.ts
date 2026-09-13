import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';

export type UserRole = 'admin' | 'teacher' | 'superadmin';
export type Theme = 'light' | 'dark';
export type Language = 'id' | 'en';

export interface UserData {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  schoolCode?: string;
  schoolName?: string;
  createdAt?: any;
}

interface AuthState {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  theme: Theme;
  language: Language;
  setUser: (user: FirebaseUser | null) => void;
  setUserData: (data: UserData | null) => void;
  setLoading: (loading: boolean) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
}

const initialTheme = (localStorage.getItem('theme') as Theme) || 'light';
if (initialTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

export const useStore = create<AuthState>((set) => ({
  user: null,
  userData: null,
  loading: true,
  theme: initialTheme,
  language: (localStorage.getItem('language') as Language) || 'id',
  setUser: (user) => set({ user }),
  setUserData: (userData) => set({ userData }),
  setLoading: (loading) => set({ loading }),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },
  setLanguage: (language) => {
    localStorage.setItem('language', language);
    set({ language });
  }
}));
