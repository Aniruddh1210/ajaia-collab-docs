import { useState } from "react";
import { generateHTML } from "@tiptap/html";
import TurndownService from "turndown";
import { editorExtensions } from "./Editor";

interface Props {
  title: string;
  content: Record<string, unknown>;
}

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(title: string): string {
  return (title.trim() || "document").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

export default function ExportMenu({ title, content }: Props) {
  const [open, setOpen] = useState(false);

  function toHtml(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return generateHTML(content as any, editorExtensions);
  }

  function exportMarkdown() {
    const md = turndown.turndown(toHtml());
    download(`${safeName(title)}.md`, `# ${title}\n\n${md}`, "text/markdown");
    setOpen(false);
  }

  function exportPdf() {
    // Open a print-friendly window; the user's "Save as PDF" completes it.
    const html = toHtml();
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${title}</title>
      <style>
        body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.6;color:#111}
        h1,h2,h3{font-family:system-ui,sans-serif}
        blockquote{border-left:3px solid #ccc;padding-left:12px;color:#555;font-style:italic}
        code{background:#f3f3f3;padding:1px 4px;border-radius:3px}
        pre{background:#1a1a1a;color:#eee;padding:12px;border-radius:6px;overflow:auto}
      </style></head>
      <body><h1>${title}</h1>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        title="Export document"
      >
        ⬇ Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <button
              onClick={exportMarkdown}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
            >
              Download as Markdown
            </button>
            <button
              onClick={exportPdf}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
            >
              Print / Save as PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
