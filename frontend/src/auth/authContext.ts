import { createContext } from 'react';
import type { AuthUser, Membership } from './types';

export interface AuthContextValue {
  user: AuthUser | null;
  memberships: Membership[];
  /** True only while the very first `/auth/me` check is in flight. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Split from AuthProvider.tsx/useAuth.ts so each of those files exports only
// a component / only a hook — a file mixing component and non-component
// exports breaks Vite's Fast Refresh boundary detection.
export const AuthContext = createContext<AuthContextValue | null>(null);
