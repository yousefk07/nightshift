import type { Store } from "../store";
import type { Connection } from "../types";
import { api, form } from "./http";

// Google and Microsoft both use OAuth 2 with refresh tokens. The secret stored on the connection is
// { refresh_token, access_token, expires_at }; a fresh access token is saved back whenever it's renewed.

export const OAUTH = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/calendar.events"],
    clientId: () => process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET ?? "",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" } as Record<string, string>,
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["offline_access", "openid", "email", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"],
    clientId: () => process.env.MICROSOFT_CLIENT_ID ?? "",
    clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET ?? "",
    extra: { prompt: "select_account" } as Record<string, string>,
  },
};
export type OAuthProvider = keyof typeof OAUTH;

export const redirectUri = (req: Request, p: string) => `${process.env.APP_URL ?? new URL(req.url).origin}/api/connect/${p}/callback`;

export function authorizeUrl(p: OAuthProvider, redirectUri: string, state: string) {
  const o = OAUTH[p];
  const q = new URLSearchParams({ client_id: o.clientId(), redirect_uri: redirectUri, response_type: "code", scope: o.scopes.join(" "), state, ...o.extra });
  return `${o.authorize}?${q}`;
}

interface TokenReply {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
}

export async function exchangeCode(p: OAuthProvider, code: string, redirectUri: string) {
  const o = OAUTH[p];
  const t = await api<TokenReply>(o.token, {
    method: "POST",
    ...form({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: o.clientId(), client_secret: o.clientSecret() }),
  });
  return { refresh_token: t.refresh_token ?? "", access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 60) * 1000, id_token: t.id_token };
}

// The email address in an OpenID id_token (only read from a token we just got from the provider, never trusted input).
export function emailFromIdToken(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return (payload.email ?? payload.preferred_username ?? null) as string | null;
  } catch {
    return null;
  }
}

// A valid access token for the connection, refreshed (and saved) when it's about to expire.
export async function accessToken(store: Store, conn: Connection): Promise<string> {
  const s = conn.secret as { refresh_token: string; access_token: string; expires_at: number };
  if (s.access_token && s.expires_at > Date.now() + 30_000) return s.access_token;
  const p = conn.provider as OAuthProvider;
  const o = OAUTH[p];
  try {
    const t = await api<TokenReply>(o.token, {
      method: "POST",
      ...form({ grant_type: "refresh_token", refresh_token: s.refresh_token, client_id: o.clientId(), client_secret: o.clientSecret() }),
    });
    const next = { ...s, access_token: t.access_token, refresh_token: t.refresh_token || s.refresh_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 };
    conn.secret = next;
    await store.saveConnection(conn.workspace_id, conn.provider, conn.account, next);
    return next.access_token;
  } catch (e) {
    await store.markConnection(conn.id, "error", (e as Error).message);
    throw new Error(`${p === "google" ? "Google" : "Microsoft"} needs to be reconnected: ${(e as Error).message}`);
  }
}
