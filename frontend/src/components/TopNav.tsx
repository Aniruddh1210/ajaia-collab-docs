import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

export default function TopNav({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth();
  const email = user?.email ?? "";
  const initial = email.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            📝
          </span>
          <span className="hidden sm:inline">Ajaia Docs</span>
        </Link>

        <div className="flex-1">{children}</div>

        <div className="flex items-center gap-3">
          <div
            title={email}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700"
          >
            {initial}
          </div>
          <button
            onClick={() => signOut()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
