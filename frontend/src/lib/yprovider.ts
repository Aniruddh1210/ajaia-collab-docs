import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * A minimal Yjs provider that syncs a Y.Doc and its awareness (cursors) over a
 * Supabase Realtime broadcast channel. No central server: peers exchange CRDT
 * updates directly, so concurrent edits merge conflict-free.
 */
export class SupabaseYProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  private channel: RealtimeChannel;
  private destroyed = false;

  constructor(docId: string, doc: Y.Doc) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.channel = supabase.channel(`ydoc:${docId}`, {
      config: { broadcast: { self: false } },
    });

    doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);

    this.channel
      .on("broadcast", { event: "y-update" }, ({ payload }) => {
        Y.applyUpdate(this.doc, fromB64(payload.u), this);
      })
      .on("broadcast", { event: "y-awareness" }, ({ payload }) => {
        applyAwarenessUpdate(this.awareness, fromB64(payload.u), this);
      })
      .on("broadcast", { event: "y-sync-request" }, () => this.pushFullState())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Ask peers for their state, and offer ours (both are idempotent).
          this.channel.send({
            type: "broadcast",
            event: "y-sync-request",
            payload: {},
          });
          this.pushFullState();
        }
      });
  }

  private pushFullState() {
    if (this.destroyed) return;
    this.channel.send({
      type: "broadcast",
      event: "y-update",
      payload: { u: toB64(Y.encodeStateAsUpdate(this.doc)) },
    });
    const ids = [...this.awareness.getStates().keys()];
    if (ids.length > 0) {
      this.channel.send({
        type: "broadcast",
        event: "y-awareness",
        payload: { u: toB64(encodeAwarenessUpdate(this.awareness, ids)) },
      });
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return; // came from a peer — don't echo it back
    this.channel.send({
      type: "broadcast",
      event: "y-update",
      payload: { u: toB64(update) },
    });
  };

  private onAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this) return;
    const ids = [...changes.added, ...changes.updated, ...changes.removed];
    this.channel.send({
      type: "broadcast",
      event: "y-awareness",
      payload: { u: toB64(encodeAwarenessUpdate(this.awareness, ids)) },
    });
  };

  destroy() {
    this.destroyed = true;
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy");
    supabase.removeChannel(this.channel);
  }
}
