import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import type { RemoteCursor } from "../lib/collab";

export const remoteCursorsKey = new PluginKey<DecorationSet>("remoteCursors");

function clamp(pos: number, doc: PMNode): number {
  return Math.min(Math.max(pos, 0), doc.content.size);
}

function build(doc: PMNode, cursors: RemoteCursor[]): DecorationSet {
  const decos: Decoration[] = [];
  for (const c of cursors) {
    const head = clamp(c.head, doc);
    const anchor = clamp(c.anchor, doc);

    // Selection highlight (if the person has a non-empty selection).
    if (anchor !== head) {
      const from = Math.min(anchor, head);
      const to = Math.max(anchor, head);
      decos.push(
        Decoration.inline(from, to, {
          class: "remote-selection",
          style: `background-color: ${c.color}33;`,
        })
      );
    }

    // Caret + name label rendered as a widget at the head position.
    decos.push(
      Decoration.widget(
        head,
        () => {
          const caret = document.createElement("span");
          caret.className = "remote-caret";
          caret.style.borderColor = c.color;
          const label = document.createElement("span");
          label.className = "remote-caret-label";
          label.style.backgroundColor = c.color;
          label.textContent = c.name;
          caret.appendChild(label);
          return caret;
        },
        { side: 10, key: `cursor-${c.userId}` }
      )
    );
  }
  return DecorationSet.create(doc, decos);
}

export const RemoteCursors = Extension.create({
  name: "remoteCursors",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: remoteCursorsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(remoteCursorsKey) as
              | { cursors: RemoteCursor[] }
              | undefined;
            if (meta) return build(tr.doc, meta.cursors);
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return remoteCursorsKey.getState(state);
          },
        },
      }),
    ];
  },
});

// Push the latest remote cursors into the editor's decoration plugin.
export function setRemoteCursors(editor: Editor, cursors: RemoteCursor[]): void {
  const view = editor.view as EditorView;
  view.dispatch(view.state.tr.setMeta(remoteCursorsKey, { cursors }));
}
