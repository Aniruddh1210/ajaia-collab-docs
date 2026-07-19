import { Link } from "react-router-dom";
import type { DocumentSummary } from "../lib/types";

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

interface Props {
  doc: DocumentSummary;
  onDelete?: (doc: DocumentSummary) => void;
}

export default function DocCard({ doc, onDelete }: Props) {
  const shared = doc.access !== "owner";
  return (
    <div className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <Link to={`/doc/${doc.id}`} className="flex-1">
        <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-gray-50 text-4xl">
          📄
        </div>
        <h3 className="truncate font-medium text-gray-900" title={doc.title}>
          {doc.title || "Untitled document"}
        </h3>
        <p className="mt-1 text-xs text-gray-500">Edited {timeAgo(doc.updated_at)}</p>
      </Link>

      <div className="mt-3 flex items-center justify-between">
        {shared ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Shared · {doc.access}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            Owned
          </span>
        )}
        {!shared && onDelete && (
          <button
            onClick={() => onDelete(doc)}
            title="Delete document"
            className="rounded p-1 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          >
            🗑
          </button>
        )}
      </div>
      {shared && (
        <p className="mt-1 truncate text-xs text-gray-400" title={doc.owner_email}>
          by {doc.owner_email}
        </p>
      )}
    </div>
  );
}
