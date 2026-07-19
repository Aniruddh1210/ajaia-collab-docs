import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { DocumentDetail } from "../lib/types";
import Editor from "../components/Editor";
import ShareDialog from "../components/ShareDialog";
import TopNav from "../components/TopNav";
import { useToast } from "../context/ToastContext";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showShare, setShowShare] = useState(false);

  // Latest unsaved payload + debounce timer, kept in refs to avoid stale closures.
  const pending = useRef<{ title?: string; content?: Record<string, unknown> }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    api
      .getDocument(id!)
      .then((d) => {
        if (!active) return;
        setDoc(d);
        setTitle(d.title);
        setStatus("ready");
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) setStatus("notfound");
        else {
          notify(e instanceof ApiError ? e.message : "Failed to load", "error");
          setStatus("notfound");
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const payload = pending.current;
    if (!payload.title && !payload.content) return;
    pending.current = {};
    setSaveState("saving");
    try {
      await api.updateDocument(id!, payload);
      setSaveState("saved");
    } catch (e) {
      // Re-queue the failed payload so the next change retries it.
      pending.current = { ...payload, ...pending.current };
      setSaveState("error");
      notify(e instanceof ApiError ? e.message : "Save failed", "error");
    }
  }, [id, notify]);

  const queueSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [flush]);

  // Flush on unmount and when the tab is being closed.
  useEffect(() => {
    const handler = () => {
      if (pending.current.title || pending.current.content) flush();
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      handler();
    };
  }, [flush]);

  const canEdit = doc?.access === "owner" || doc?.access === "editor";
  const isOwner = doc?.access === "owner";

  function onTitleChange(value: string) {
    setTitle(value);
    pending.current.title = value;
    setSaveState("saving");
    queueSave();
  }

  function onContentChange(json: Record<string, unknown>) {
    pending.current.content = json;
    setSaveState("saving");
    queueSave();
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen">
        <TopNav />
        <div className="mx-auto mt-16 max-w-3xl px-4">
          <div className="h-10 w-1/2 animate-pulse rounded bg-gray-200" />
          <div className="mt-6 h-96 animate-pulse rounded-xl bg-white" />
        </div>
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div className="min-h-screen">
        <TopNav />
        <div className="mx-auto mt-24 max-w-md px-4 text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="mt-4 text-xl font-semibold">Document not available</h1>
          <p className="mt-2 text-sm text-gray-500">
            It may not exist, or it hasn't been shared with your account.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Back to documents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopNav>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            title="Back to documents"
          >
            ←
          </button>
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={!canEdit}
            maxLength={200}
            placeholder="Untitled document"
            className="w-full max-w-md rounded border border-transparent px-2 py-1 text-sm font-medium hover:border-gray-200 focus:border-brand-500 focus:outline-none disabled:bg-transparent"
          />
          <SaveBadge state={saveState} canEdit={canEdit} />
        </div>
      </TopNav>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {!canEdit && (
          <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
            👁 View only — shared by {doc?.owner_email}
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {doc && (
            <Editor
              content={doc.content}
              editable={canEdit}
              onChange={canEdit ? onContentChange : undefined}
            />
          )}
        </div>
      </main>

      {isOwner && (
        <button
          onClick={() => setShowShare(true)}
          className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-brand-700"
        >
          🔗 Share
        </button>
      )}
      {showShare && id && (
        <ShareDialog docId={id} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

function SaveBadge({ state, canEdit }: { state: SaveState; canEdit: boolean }) {
  if (!canEdit) return null;
  const map: Record<SaveState, { text: string; cls: string }> = {
    idle: { text: "", cls: "text-gray-400" },
    saving: { text: "Saving…", cls: "text-gray-400" },
    saved: { text: "Saved", cls: "text-green-600" },
    error: { text: "Retry pending", cls: "text-red-600" },
  };
  const s = map[state];
  return <span className={`whitespace-nowrap text-xs ${s.cls}`}>{s.text}</span>;
}
