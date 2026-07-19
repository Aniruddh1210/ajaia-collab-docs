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
}

export const editorExtensions = [
  StarterKit,
  Underline,
  Placeholder.configure({ placeholder: "Start writing…" }),
];

export default function Editor({ content, editable, onChange }: Props) {
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
