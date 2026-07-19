import { useEffect } from "react";
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type * as Y from "yjs";
import Toolbar from "./Toolbar";
import AiAssistant from "./AiAssistant";
import type { SupabaseYProvider } from "../lib/yprovider";

interface Props {
  ydoc: Y.Doc;
  provider: SupabaseYProvider;
  user: { name: string; color: string };
  editable: boolean;
  onChange?: (json: Record<string, unknown>) => void;
  onReady?: (editor: TiptapEditor) => void;
}

// Schema-only extensions, reused for generateJSON/generateHTML on file import/export.
export const editorExtensions = [
  StarterKit,
  Underline,
  Placeholder.configure({ placeholder: "Start writing…" }),
];

export default function Editor({
  ydoc,
  provider,
  user,
  editable,
  onChange,
  onReady,
}: Props) {
  const editor = useEditor(
    {
      extensions: [
        // Yjs owns undo/redo, so disable StarterKit's history.
        StarterKit.configure({ undoRedo: false }),
        Underline,
        Placeholder.configure({ placeholder: "Start writing…" }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCaret.configure({
          provider,
          user,
          render: (u: { name?: string; color?: string }) => {
            const caret = document.createElement("span");
            caret.className = "collab-caret";
            caret.style.borderColor = u.color ?? "#888";
            const label = document.createElement("span");
            label.className = "collab-caret__label";
            label.style.backgroundColor = u.color ?? "#888";
            label.textContent = u.name ?? "Someone";
            caret.appendChild(label);
            return caret;
          },
        }),
      ],
      editable,
      editorProps: { attributes: { class: "prose max-w-none" } },
      onUpdate: ({ editor }) => {
        onChange?.(editor.getJSON() as Record<string, unknown>);
      },
    },
    [ydoc]
  );

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (editor) onReady?.(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  return (
    <div>
      {editable && <Toolbar editor={editor} right={<AiAssistant editor={editor} />} />}
      <div className="px-8 py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
