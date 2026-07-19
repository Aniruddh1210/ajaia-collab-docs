import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

/** Result of a sign-up attempt so the UI can react appropriately. */
export interface SignUpResult {
  /** True when a session was established immediately (email confirmation off). */
  signedIn: boolean;
  /** True when confirmation is required — the user must verify via email. */
  needsConfirmation: boolean;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUpWithPassword: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // When an email is already registered, Supabase (with confirmation on)
      // returns a user with an empty identities array rather than an error.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        throw new Error("An account with this email already exists. Try signing in.");
      }

      // A session is present only when email confirmation is disabled; otherwise
      // the user must confirm via the emailed link before they can sign in.
      return {
        signedIn: data.session != null,
        needsConfirmation: data.session == null,
      };
    },
    signOut: async () => {
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
