import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as Y from "yjs";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { DocumentDetail } from "../lib/types";
import { colorForId, displayName, initials, type Peer } from "../lib/collab";
import { SupabaseYProvider } from "../lib/yprovider";
import Editor from "../components/Editor";
import ShareDialog from "../components/ShareDialog";
import ExportMenu from "../components/ExportMenu";
import TopNav from "../components/TopNav";
import { useToast } from "../context/ToastContext";

type SaveState = "idle" | "saving" | "saved" | "error";

interface Collab {
  ydoc: Y.Doc;
  provider: SupabaseYProvider;
}

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { user } = useAuth();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [title, setTitle] = useState("");
  const [liveContent, setLiveContent] = useState<Record<string, unknown> | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showShare, setShowShare] = useState(false);
  const [collab, setCollab] = useState<Collab | null>(null);
  const [collabReady, setCollabReady] = useState(false);

  const myId = user?.id ?? "anon";
  const myName = displayName(user);
  const myColor = colorForId(myId);

  const pending = useRef<{ title?: string; content?: Record<string, unknown> }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const seedRef = useRef<{ content: Record<string, unknown>; title: string } | null>(null);

  const canEdit = doc?.access === "owner" || doc?.access === "editor";
  const isOwner = doc?.access === "owner";

  // 1. Load the document (last-saved content is the seed for the live session).
  useEffect(() => {
    let active = true;
    setStatus("loading");
    setCollab(null);
    setCollabReady(false);
    api
      .getDocument(id!)
      .then((d) => {
        if (!active) return;
        seedRef.current = { content: d.content, title: d.title };
        setDoc(d);
        setTitle(d.title);
        setLiveContent(d.content);
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

  // 2. Open the CRDT session: sync the Y.Doc + cursor awareness over Realtime.
  useEffect(() => {
    if (status !== "ready" || !id) return;
    const ydoc = new Y.Doc();
    const provider = new SupabaseYProvider(id, ydoc);
    provider.awareness.setLocalStateField("user", { name: myName, color: myColor });

    // Presence: derive "who's here" from awareness user states.
    const onAware = () => {
      const list: Peer[] = [];
      provider.awareness.getStates().forEach((st, clientId) => {
        if (clientId === ydoc.clientID) return;
        const u = (st as { user?: { name: string; color: string } }).user;
        if (u && !list.find((x) => x.userId === String(clientId))) {
          list.push({ userId: String(clientId), name: u.name, color: u.color });
        }
      });
      setPeers(list);
    };
    provider.awareness.on("change", onAware);

    // Title syncs through a small Y.Map entry (last-write-wins, fine for a title).
    const meta = ydoc.getMap("meta");
    const onMeta = () => {
      const t = meta.get("title");
      if (typeof t === "string" && document.activeElement !== titleRef.current) {
        setTitle(t);
      }
    };
    meta.observe(onMeta);

    // Wait briefly for initial sync before mounting the editor, so a late joiner
    // binds to already-synced content instead of inserting a duplicate blank doc.
    const readyTimer = setTimeout(() => setCollabReady(true), 500);

    setCollab({ ydoc, provider });
    return () => {
      clearTimeout(readyTimer);
      provider.awareness.off("change", onAware);
      meta.unobserve(onMeta);
      provider.destroy();
      ydoc.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, id, myName, myColor]);

  // Seed the shared doc from the DB exactly once (single elected seeder).
  const onEditorReady = useCallback(
    (editor: TiptapEditor) => {
      editorRef.current = editor;
      if (!collab) return;
      const { ydoc, provider } = collab;
      const meta = ydoc.getMap("meta");
      if (meta.get("seeded")) return;
      const ids = [...provider.awareness.getStates().keys()];
      const minId = Math.min(ydoc.clientID, ...ids);
      if (ydoc.clientID !== minId) return; // someone else will seed
      const seed = seedRef.current;
      if (seed) {
        if (seed.content) editor.commands.setContent(seed.content);
        meta.set("title", seed.title);
      }
      meta.set("seeded", true);
    },
    [collab]
  );

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
      pending.current = { ...payload, ...pending.current };
      setSaveState("error");
      notify(e instanceof ApiError ? e.message : "Save failed", "error");
    }
  }, [id, notify]);

  const queueSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [flush]);

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

  function onTitleChange(value: string) {
    setTitle(value);
    collab?.ydoc.getMap("meta").set("title", value);
    if (!canEdit) return;
    pending.current.title = value;
    setSaveState("saving");
    queueSave();
  }

  // Fires on every editor change — local edits and merged remote edits alike.
  function onContentChange(json: Record<string, unknown>) {
    setLiveContent(json);
    if (!canEdit) return;
    pending.current.content = json;
    setSaveState("saving");
    queueSave();
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen">
        <TopNav />
        <div className="mx-auto mt-16 max-w-3xl px-4">
          <div className="h-10 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-6 h-96 animate-pulse rounded-xl bg-white dark:bg-gray-900" />
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
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            title="Back to documents"
          >
            ←
          </button>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={!canEdit}
            maxLength={200}
            placeholder="Untitled document"
            className="w-full max-w-md rounded border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-gray-200 focus:border-brand-500 focus:outline-none disabled:bg-transparent dark:hover:border-gray-700"
          />
          <SaveBadge state={saveState} canEdit={canEdit} />
          <PresenceAvatars peers={peers} />
          {liveContent && <ExportMenu title={title} content={liveContent} />}
        </div>
      </TopNav>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {!canEdit && (
          <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            👁 View only — shared by {doc?.owner_email}
          </div>
        )}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {collab && collabReady ? (
            <Editor
              ydoc={collab.ydoc}
              provider={collab.provider}
              user={{ name: myName, color: myColor }}
              editable={canEdit}
              onChange={onContentChange}
              onReady={onEditorReady}
            />
          ) : (
            <div className="px-8 py-10 text-sm text-gray-400">Connecting…</div>
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

function PresenceAvatars({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) return null;
  return (
    <div className="flex items-center -space-x-1.5" title="People editing now">
      {peers.slice(0, 4).map((p) => (
        <div
          key={p.userId}
          title={p.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white dark:border-gray-900"
          style={{ backgroundColor: p.color }}
        >
          {initials(p.name)}
        </div>
      ))}
      {peers.length > 4 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-400 text-[10px] font-semibold text-white dark:border-gray-900">
          +{peers.length - 4}
        </div>
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
