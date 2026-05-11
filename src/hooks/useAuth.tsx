import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { authApi, ApiUser, ApiProfile, AppRole, ApiError } from "@/lib/api";

interface AuthContextValue {
  user: ApiUser | null;
  profile: ApiProfile | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, display_name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me.user);
      setProfile(me.profile);
      setRoles(me.roles || []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setProfile(null);
        setRoles([]);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    await authApi.login(email, password);
    await refresh();
  };

  const signUp = async (email: string, password: string, display_name?: string) => {
    await authApi.register(email, password, display_name);
    await refresh();
  };

  const signOut = async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    setUser(null);
    setProfile(null);
    setRoles([]);
  };

  return (
    <AuthContext.Provider value={{ user, profile, roles, loading, signIn, signUp, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
