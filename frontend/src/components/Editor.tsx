import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/react";
import Toolbar from "./Toolbar";

interface Props {
  content: Record<string, unknown> | null;
  editable: boolean;
  onChange?: (json: Record<string, unknown>) => void;
  // Live content pushed from another user via Realtime. Bumping `nonce`
  // triggers re-applying `data` into the editor.
  incoming?: { data: Record<string, unknown>; nonce: number } | null;
}

export const editorExtensions = [
  StarterKit,
  Underline,
  Placeholder.configure({ placeholder: "Start writing…" }),
];

export default function Editor({ content, editable, onChange, incoming }: Props) {
  const editor = useEditor({
    extensions: editorExtensions,
    editable,
    content: (content as JSONContent) ?? { type: "doc", content: [] },
    editorProps: {
      attributes: { class: "prose max-w-none" },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON() as Record<string, unknown>);
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  // Apply a remote update. Viewers always get it live; an editor gets it only
  // while they're not actively typing, so their cursor isn't yanked away.
  useEffect(() => {
    if (!editor || !incoming) return;
    if (editable && editor.isFocused) return;
    const current = JSON.stringify(editor.getJSON());
    if (current === JSON.stringify(incoming.data)) return;
    editor.commands.setContent(incoming.data as JSONContent, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.nonce, editor]);

  if (!editor) return null;

  return (
    <div>
      {editable && <Toolbar editor={editor} />}
      <div className="px-8 py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
