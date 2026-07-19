import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function Login() {
  const { signInWithPassword, signUpWithPassword } = useAuth();
  const { notify } = useToast();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithPassword(email, password);
      } else {
        const result = await signUpWithPassword(email, password);
        if (result.needsConfirmation) {
          notify("Account created — check your email to confirm, then sign in", "success");
          setMode("signin");
          setPassword("");
        } else {
          notify("Account created — you're signed in", "success");
        }
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Authentication failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm dark:bg-gray-900">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-2xl">
            📝
          </div>
          <h1 className="text-xl font-semibold">Ajaia Docs</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            A lightweight collaborative editor
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          {mode === "signin" ? "No account?" : "Have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-medium text-brand-600 hover:underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
