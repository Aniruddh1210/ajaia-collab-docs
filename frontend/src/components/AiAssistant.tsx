import { useEffect, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../context/ToastContext";
import type { AIAction } from "../lib/types";

interface Props {
  editor: Editor;
}

// Actions that transform the current selection vs. act on the whole document.
const SELECTION_ACTIONS: { action: AIAction; label: string }[] = [
  { action: "improve", label: "Improve writing" },
  { action: "fix", label: "Fix spelling & grammar" },
  { action: "shorten", label: "Make shorter" },
  { action: "lengthen", label: "Make longer" },
  { action: "professional", label: "Professional tone" },
  { action: "casual", label: "Casual tone" },
];
const DOC_ACTIONS: { action: AIAction; label: string }[] = [
  { action: "summarize", label: "Summarize document" },
  { action: "continue", label: "Continue writing" },
];

const LABELS: Record<AIAction, string> = {
  improve: "Improve writing",
  fix: "Fix spelling & grammar",
  shorten: "Make shorter",
  lengthen: "Make longer",
  professional: "Professional tone",
  casual: "Casual tone",
  custom: "Custom instruction",
  summarize: "Summarize document",
  continue: "Continue writing",
};

interface Pending {
  action: AIAction;
  source: string;
  instruction?: string;
  // Selection range to replace on accept (selection actions only).
  range?: { from: number; to: number };
  result: string;
}

/** Convert plain text with line breaks into TipTap paragraph nodes. */
function textToNodes(text: string): JSONContent[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block): JSONContent => {
      const lines = block.split("\n");
      const content: JSONContent[] = [];
      lines.forEach((line, i) => {
        if (i > 0) content.push({ type: "hardBreak" });
        if (line) content.push({ type: "text", text: line });
      });
      return { type: "paragraph", content: content.length ? content : undefined };
    });
}

export default function AiAssistant({ editor }: Props) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function selectionText(): { text: string; range: { from: number; to: number } } {
    const { from, to } = editor.state.selection;
    return { text: editor.state.doc.textBetween(from, to, "\n"), range: { from, to } };
  }

  async function run(
    action: AIAction,
    source: string,
    range?: { from: number; to: number },
    instr?: string
  ) {
    setOpen(false);
    setCustomOpen(false);
    setLoading(true);
    try {
      const { result } = await api.aiAssist(action, source, instr);
      setPending({ action, source, instruction: instr, range, result });
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "AI request failed", "error");
    } finally {
      setLoading(false);
    }
  }

  function startSelectionAction(action: AIAction) {
    const { text, range } = selectionText();
    if (!text.trim()) {
      notify("Select some text first.", "info");
      setOpen(false);
      return;
    }
    run(action, text, range);
  }

  function startCustom() {
    const { text, range } = selectionText();
    if (!text.trim()) {
      notify("Select some text to apply an instruction to.", "info");
      return;
    }
    if (!instruction.trim()) return;
    run("custom", text, range, instruction.trim());
    setInstruction("");
  }

  function startDocAction(action: AIAction) {
    const text = editor.getText().trim();
    if (!text) {
      notify("The document is empty.", "info");
      setOpen(false);
      return;
    }
    run(action, text);
  }

  function accept() {
    if (!pending) return;
    const { action, result, range } = pending;
    const nodes = textToNodes(result);
    const size = editor.state.doc.content.size;

    if (action === "summarize") {
      const content: JSONContent[] = [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Summary" }] },
        ...nodes,
      ];
      editor.chain().focus().insertContentAt(0, content).run();
    } else if (action === "continue") {
      editor.chain().focus().insertContentAt(size, nodes).run();
    } else if (range) {
      const from = Math.min(range.from, size);
      const to = Math.min(range.to, size);
      editor.chain().focus().insertContentAt({ from, to }, nodes).run();
    }
    setPending(null);
  }

  const busyLabel = "Thinking…";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={loading}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="AI writing assistant"
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-brand-700 transition hover:bg-brand-50 disabled:opacity-60 dark:text-brand-300 dark:hover:bg-brand-700/20"
      >
        <span>{loading ? "⏳" : "✨"}</span>
        <span>{loading ? busyLabel : "AI"}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Edit selection
          </p>
          {SELECTION_ACTIONS.map((a) => (
            <MenuItem key={a.action} onClick={() => startSelectionAction(a.action)}>
              {a.label}
            </MenuItem>
          ))}
          {customOpen ? (
            <div className="px-3 py-2">
              <input
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startCustom()}
                placeholder="e.g. translate to French"
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800"
              />
              <button
                type="button"
                onClick={startCustom}
                className="mt-2 w-full rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
              >
                Apply to selection
              </button>
            </div>
          ) : (
            <MenuItem onClick={() => setCustomOpen(true)}>Custom instruction…</MenuItem>
          )}

          <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Whole document
          </p>
          {DOC_ACTIONS.map((a) => (
            <MenuItem key={a.action} onClick={() => startDocAction(a.action)}>
              {a.label}
            </MenuItem>
          ))}
        </div>
      )}

      {pending && (
        <ResultModal
          pending={pending}
          onAccept={accept}
          onDiscard={() => setPending(null)}
          onRegenerate={() =>
            run(pending.action, pending.source, pending.range, pending.instruction)
          }
        />
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-gray-700 hover:bg-brand-50 dark:text-gray-200 dark:hover:bg-brand-700/20"
    >
      {children}
    </button>
  );
}

function ResultModal({
  pending,
  onAccept,
  onDiscard,
  onRegenerate,
}: {
  pending: Pending;
  onAccept: () => void;
  onDiscard: () => void;
  onRegenerate: () => void;
}) {
  const acceptLabel =
    pending.action === "summarize"
      ? "Insert at top"
      : pending.action === "continue"
      ? "Append to document"
      : "Replace selection";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onDiscard}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
          <span>✨</span>
          <h3 className="text-sm font-semibold">{LABELS[pending.action]}</h3>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-100">
            {pending.result}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            ↻ Regenerate
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="rounded bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              {acceptLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
