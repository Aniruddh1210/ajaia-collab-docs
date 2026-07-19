import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  DEV_AUTH,
  clearDevSession,
  loadDevSession,
  mintDevSession,
  saveDevSession,
} from "../lib/devAuth";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  devAuth: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signInAsDev: (email: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEV_AUTH) {
      // Local dev: restore any minted session from localStorage, no Supabase.
      const dev = loadDevSession();
      setSession(dev ? (dev as unknown as Session) : null);
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    loading,
    devAuth: DEV_AUTH,
    signInAsDev: async (email, fullName) => {
      const dev = await mintDevSession(email, fullName);
      saveDevSession(dev);
      setSession(dev as unknown as Session);
    },
    signInWithGoogle: async () => {
      // Return to this exact app URL (includes the GitHub Pages base path).
      const redirectTo = window.location.origin + import.meta.env.BASE_URL;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    },
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUpWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      if (DEV_AUTH) {
        clearDevSession();
        setSession(null);
        return;
      }
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
