import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateJSON } from "@tiptap/html";
import { api, ApiError } from "../lib/api";
import { editorExtensions } from "./Editor";
import { useToast } from "../context/ToastContext";

const ACCEPT = ".txt,.md,.markdown,.docx";

export default function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    setBusy(true);
    try {
      const { title, html } = await api.importFile(file);
      // Convert imported HTML to TipTap JSON using the editor's own schema.
      const content = generateJSON(html, editorExtensions) as Record<string, unknown>;
      const doc = await api.createDocument({ title, content });
      notify(`Imported "${title}"`, "success");
      navigate(`/doc/${doc.id}`);
    } catch (err) {
      notify(
        err instanceof ApiError ? err.message : "Import failed",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Supported: .txt, .md, .docx (up to 5 MB)"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {busy ? "Importing…" : "⬆ Upload file"}
      </button>
    </>
  );
}
