import type { User } from "@supabase/supabase-js";

export interface Peer {
  userId: string;
  name: string;
  color: string;
}

// Distinct, readable cursor colors.
const PALETTE = [
  "#e6194B", "#3cb44b", "#f58231", "#4363d8", "#911eb4",
  "#008080", "#9A6324", "#800000", "#808000", "#e07be0",
];

export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function displayName(user: User | null): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const full = (meta.full_name as string) || (meta.name as string);
  if (full) return full;
  const email = user?.email ?? "";
  return email ? email.split("@")[0] : "Someone";
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
