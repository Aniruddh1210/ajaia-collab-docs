import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type { Role, Share } from "../lib/types";

interface Props {
  docId: string;
  onClose: () => void;
}

export default function ShareDialog({ docId, onClose }: Props) {
  const { notify } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      setShares(await api.listShares(docId));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Failed to load shares", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await api.addShare(docId, email.trim().toLowerCase(), role);
      notify(`Shared with ${email}`, "success");
      setEmail("");
      await load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Failed to share", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(share: Share) {
    try {
      await api.removeShare(docId, share.id);
      setShares((s) => s.filter((x) => x.id !== share.id));
      notify(`Removed ${share.email}`, "info");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Failed to remove", "error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Share document</h2>
        <p className="mt-1 text-sm text-gray-500">
          Share with another user by their account email. They must have signed in
          at least once.
        </p>

        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            type="email"
            required
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Share
          </button>
        </form>

        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            People with access
          </h3>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-gray-400">Not shared with anyone yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-800">{s.email}</p>
                    <p className="text-xs capitalize text-gray-400">{s.role}</p>
                  </div>
                  <button
                    onClick={() => revoke(s)}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 text-right">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
