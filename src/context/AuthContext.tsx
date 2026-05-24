import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase';

export type Role = 'super_admin' | 'admin' | 'viewer' | 'custom' | null;

interface AuthContextValue {
  session:     Session | null;
  role:        Role;
  permissions: string[];
  loading:     boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null, role: null, permissions: [], loading: true,
});

function parseSession(s: Session | null): { role: Role; permissions: string[] } {
  if (!s) return { role: null, permissions: [] };
  const meta        = s.user.user_metadata ?? {};
  const role        = (meta.role as Role) ?? 'viewer';
  const permissions = Array.isArray(meta.permissions) ? (meta.permissions as string[]) : [];
  return { role, permissions };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session,     setSession]     = useState<Session | null>(null);
  const [role,        setRole]        = useState<Role>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading,     setLoading]     = useState(true);

  const applySession = (s: Session | null) => {
    const parsed = parseSession(s);
    setSession(s);
    setRole(parsed.role);
    setPermissions(parsed.permissions);
  };

  useEffect(() => {
    // If Supabase is not configured, bypass auth and show dashboard directly
    if (!SUPABASE_CONFIGURED) {
      setLoading(false);
      // Create a minimal fake session so the app renders
      setSession({ user: { id: 'local', email: 'admin@local', user_metadata: { role: 'super_admin' } } } as unknown as Session);
      setRole('super_admin');
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => applySession(s));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, role, permissions, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
