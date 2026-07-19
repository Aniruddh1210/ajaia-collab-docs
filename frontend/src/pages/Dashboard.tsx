import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { DocumentSummary } from "../lib/types";
import DocCard from "../components/DocCard";
import UploadButton from "../components/UploadButton";
import TopNav from "../components/TopNav";
import { useToast } from "../context/ToastContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      setDocs(await api.listDocuments());
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Failed to load documents", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createNew() {
    setCreating(true);
    try {
      const doc = await api.createDocument({});
      navigate(`/doc/${doc.id}`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Failed to create", "error");
      setCreating(false);
    }
  }

  async function remove(doc: DocumentSummary) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(doc.id);
      setDocs((d) => d.filter((x) => x.id !== doc.id));
      notify("Document deleted", "info");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Failed to delete", "error");
    }
  }

  const owned = docs.filter((d) => d.access === "owner");
  const shared = docs.filter((d) => d.access !== "owner");

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Your documents</h1>
          <div className="flex gap-2">
            <UploadButton />
            <button
              onClick={createNew}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              + New document
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonGrid />
        ) : (
          <>
            <Section title="My documents" empty="No documents yet. Create one to get started.">
              {owned.map((d) => (
                <DocCard key={d.id} doc={d} onDelete={remove} />
              ))}
            </Section>

            <Section
              title="Shared with me"
              empty="Nothing shared with you yet."
              hideWhenEmpty
              items={shared.length}
            >
              {shared.map((d) => (
                <DocCard key={d.id} doc={d} />
              ))}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
  hideWhenEmpty,
  items,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
  hideWhenEmpty?: boolean;
  items?: number;
}) {
  const count = items ?? (Array.isArray(children) ? children.length : 0);
  if (hideWhenEmpty && count === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {title}
      </h2>
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white/50 p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-500">
          {empty}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {children}
        </div>
      )}
    </section>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-52 animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
        />
      ))}
    </div>
  );
}
