// Local-only dev authentication.
//
// Gated entirely behind VITE_DEV_AUTH === "true". When enabled, this lets a
// reviewer sign in without a real Supabase project by minting a short-lived
// HS256 JWT in the browser, signed with the backend's built-in fallback secret
// (see backend app/config.py: supabase_jwt_secret default "dev-secret-change-me").
// The backend accepts this token via its HS256 fallback path whenever
// SUPABASE_URL is not configured. This code path never runs in production
// builds where VITE_DEV_AUTH is unset.

export const DEV_AUTH =
  (import.meta.env.VITE_DEV_AUTH as string | undefined) === "true";

// Must match the backend's supabase_jwt_secret default for HS256 verification.
const DEV_SECRET =
  (import.meta.env.VITE_DEV_JWT_SECRET as string | undefined) ??
  "dev-secret-change-me";

const AUDIENCE =
  (import.meta.env.VITE_DEV_JWT_AUDIENCE as string | undefined) ??
  "authenticated";

const STORAGE_KEY = "ajaia.devSession";

export interface DevSession {
  access_token: string;
  user: { id: string; email: string; user_metadata: { full_name?: string } };
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return b64url(enc.encode(JSON.stringify(obj)));
}

async function hmacSha256(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

// Derive a stable RFC-4122-shaped UUID from an email so the same dev user maps
// to the same backend profile across logins (important for the sharing flow).
async function uuidFromEmail(email: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(`ajaia-dev:${email}`))
  );
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

export async function mintDevSession(
  email: string,
  fullName?: string
): Promise<DevSession> {
  const normalized = email.trim().toLowerCase();
  const sub = await uuidFromEmail(normalized);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub,
    email: normalized,
    aud: AUDIENCE,
    role: "authenticated",
    iat: now,
    exp: now + 24 * 60 * 60,
    user_metadata: { full_name: fullName || normalized.split("@")[0] },
  };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const signature = b64url(await hmacSha256(signingInput, DEV_SECRET));
  const token = `${signingInput}.${signature}`;
  return {
    access_token: token,
    user: { id: sub, email: normalized, user_metadata: payload.user_metadata },
  };
}

export function loadDevSession(): DevSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as DevSession;
    // Drop expired tokens so a stale session doesn't wedge the app.
    const payload = JSON.parse(atob(session.access_token.split(".")[1]));
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveDevSession(session: DevSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearDevSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
