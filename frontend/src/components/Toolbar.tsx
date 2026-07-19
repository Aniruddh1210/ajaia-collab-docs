import type { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
}

interface Btn {
  label: string;
  title: string;
  isActive: () => boolean;
  run: () => void;
}

export default function Toolbar({ editor }: Props) {
  const buttons: (Btn | "divider")[] = [
    {
      label: "B",
      title: "Bold (Ctrl+B)",
      isActive: () => editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "I",
      title: "Italic (Ctrl+I)",
      isActive: () => editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "U",
      title: "Underline (Ctrl+U)",
      isActive: () => editor.isActive("underline"),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    "divider",
    {
      label: "H1",
      title: "Heading 1",
      isActive: () => editor.isActive("heading", { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "H2",
      title: "Heading 2",
      isActive: () => editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "H3",
      title: "Heading 3",
      isActive: () => editor.isActive("heading", { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "P",
      title: "Paragraph",
      isActive: () => editor.isActive("paragraph"),
      run: () => editor.chain().focus().setParagraph().run(),
    },
    "divider",
    {
      label: "• List",
      title: "Bullet list",
      isActive: () => editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "1. List",
      title: "Numbered list",
      isActive: () => editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "❝",
      title: "Quote",
      isActive: () => editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-gray-200 bg-white px-3 py-2">
      {buttons.map((b, i) =>
        b === "divider" ? (
          <span key={i} className="mx-1 h-5 w-px bg-gray-200" />
        ) : (
          <button
            key={b.label}
            type="button"
            title={b.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={b.run}
            className={
              "min-w-8 rounded px-2 py-1 text-sm font-medium transition " +
              (b.isActive()
                ? "bg-brand-100 text-brand-700"
                : "text-gray-700 hover:bg-gray-100")
            }
          >
            {b.label === "B" ? <b>B</b> : b.label === "I" ? <i>I</i> : b.label === "U" ? <u>U</u> : b.label}
          </button>
        )
      )}
    </div>
  );
}
