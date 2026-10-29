import type { Store } from "../store";
import type { Connection, ConnectionKind } from "../types";
import { api, form } from "./http";

// Every provider that connects by OAuth 2. The secret stored on the connection is
// { refresh_token, access_token, expires_at, ...provider ids }; a fresh access token is saved back when renewed.

interface OAuthConfig {
  label: string;
  kinds: ConnectionKind[];
  authorize: string;
  token: string;
  scopes: string[];
  clientId: () => string;
  clientSecret: () => string;
  extra?: Record<string, string>;
  basicAuth?: boolean; // client id/secret in an Authorization: Basic header (Intuit, Xero)
  jsonBody?: boolean; // token endpoint takes JSON (FreshBooks)
}

const env = (k: string) => () => process.env[k] ?? "";

export const OAUTH = {
  google: {
    label: "Google",
    kinds: ["email", "calendar"],
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/spreadsheets.readonly"],
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  microsoft: {
    label: "Microsoft",
    kinds: ["email", "calendar"],
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["offline_access", "openid", "email", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"],
    clientId: env("MICROSOFT_CLIENT_ID"),
    clientSecret: env("MICROSOFT_CLIENT_SECRET"),
    extra: { prompt: "select_account" },
  },
  quickbooks: {
    label: "QuickBooks",
    kinds: ["accounting"],
    authorize: "https://appcenter.intuit.com/connect/oauth2",
    token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: ["com.intuit.quickbooks.accounting"],
    clientId: env("QUICKBOOKS_CLIENT_ID"),
    clientSecret: env("QUICKBOOKS_CLIENT_SECRET"),
    basicAuth: true,
  },
  xero: {
    label: "Xero",
    kinds: ["accounting"],
    authorize: "https://login.xero.com/identity/connect/authorize",
    token: "https://identity.xero.com/connect/token",
    scopes: ["offline_access", "openid", "email", "accounting.transactions", "accounting.contacts", "accounting.settings.read"],
    clientId: env("XERO_CLIENT_ID"),
    clientSecret: env("XERO_CLIENT_SECRET"),
    basicAuth: true,
  },
  freshbooks: {
    label: "FreshBooks",
    kinds: ["accounting"],
    authorize: "https://auth.freshbooks.com/oauth/authorize",
    token: "https://api.freshbooks.com/auth/oauth/token",
    scopes: ["user:profile:read", "user:invoices:read", "user:invoices:write", "user:clients:read", "user:clients:write", "user:payments:read", "user:credit_notes:read", "user:credit_notes:write"],
    clientId: env("FRESHBOOKS_CLIENT_ID"),
    clientSecret: env("FRESHBOOKS_CLIENT_SECRET"),
    jsonBody: true,
  },
} satisfies Record<string, OAuthConfig>;
export type OAuthProvider = keyof typeof OAUTH;
export const isOAuthProvider = (p: string): p is OAuthProvider => p in OAUTH;

export const redirectUri = (req: Request, p: string) => `${process.env.APP_URL ?? new URL(req.url).origin}/api/connect/${p}/callback`;

export function authorizeUrl(p: OAuthProvider, redirect: string, state: string) {
  const o: OAuthConfig = OAUTH[p];
  const q = new URLSearchParams({ client_id: o.clientId(), redirect_uri: redirect, response_type: "code", scope: o.scopes.join(" "), state, ...o.extra });
  return `${o.authorize}?${q}`;
}

interface TokenReply {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

function tokenRequest(o: OAuthConfig, data: Record<string, string>) {
  if (o.jsonBody) return api<TokenReply>(o.token, { method: "POST", json: { ...data, client_id: o.clientId(), client_secret: o.clientSecret() } });
  if (o.basicAuth) {
    const basic = Buffer.from(`${o.clientId()}:${o.clientSecret()}`).toString("base64");
    const f = form(data);
    return api<TokenReply>(o.token, { method: "POST", body: f.body, headers: { ...f.headers, Authorization: `Basic ${basic}`, Accept: "application/json" } });
  }
  return api<TokenReply>(o.token, { method: "POST", ...form({ ...data, client_id: o.clientId(), client_secret: o.clientSecret() }) });
}

const expiry = (t: TokenReply) => Date.now() + (t.expires_in - 60) * 1000;

export async function exchangeCode(p: OAuthProvider, code: string, redirect: string) {
  const t = await tokenRequest(OAUTH[p], { grant_type: "authorization_code", code, redirect_uri: redirect });
  return { refresh_token: t.refresh_token ?? "", access_token: t.access_token, expires_at: expiry(t), id_token: t.id_token };
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

// A valid access token for the connection, refreshed (and saved) when it's about to expire. A refresh that fails
// marks the connection "needs sign-in", which shows the reconnect banner and blocks the bots that use it.
export async function accessToken(store: Store, conn: Connection): Promise<string> {
  const s = conn.secret as { refresh_token: string; access_token: string; expires_at: number };
  if (s.access_token && s.expires_at > Date.now() + 30_000) return s.access_token;
  if (!isOAuthProvider(conn.provider)) throw new Error(`${conn.provider} doesn't use OAuth`);
  const o: OAuthConfig = OAUTH[conn.provider];
  try {
    const t = await tokenRequest(o, { grant_type: "refresh_token", refresh_token: s.refresh_token });
    const next = { ...conn.secret, access_token: t.access_token, refresh_token: t.refresh_token || s.refresh_token, expires_at: expiry(t) };
    conn.secret = next;
    await store.saveConnection(conn.workspace_id, conn.provider, conn.kinds, conn.account, next);
    return t.access_token;
  } catch (e) {
    await store.markConnection(conn.id, { status: "needs_signin", error: (e as Error).message });
    conn.status = "needs_signin";
    throw new Error(`${o.label} needs to be reconnected: ${(e as Error).message}`);
  }
}

// After the first token: the provider's own ids and a readable account name for the Connections page.
export async function accountDetails(p: OAuthProvider, t: { access_token: string; id_token?: string }, query: URLSearchParams): Promise<{ account: string; extra: Record<string, string> }> {
  if (p === "google" || p === "microsoft") return { account: emailFromIdToken(t.id_token) ?? p, extra: {} };
  if (p === "quickbooks") {
    const realm = query.get("realmId");
    if (!realm) throw new Error("QuickBooks didn't say which company");
    const base = process.env.QBO_SANDBOX === "1" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
    const info = await api<{ CompanyInfo: { CompanyName: string } }>(`${base}/v3/company/${realm}/companyinfo/${realm}?minorversion=75`, { token: t.access_token, headers: { Accept: "application/json" } }).catch(() => null);
    return { account: info?.CompanyInfo.CompanyName ?? `QuickBooks ${realm}`, extra: { realm_id: realm } };
  }
  if (p === "xero") {
    const tenants = await api<{ tenantId: string; tenantName: string }[]>("https://api.xero.com/connections", { token: t.access_token });
    if (!tenants[0]) throw new Error("No Xero organisation was shared");
    return { account: tenants[0].tenantName, extra: { tenant_id: tenants[0].tenantId } };
  }
  const me = await api<{ response: { business_memberships: { business: { name: string; account_id: string } }[] } }>("https://api.freshbooks.com/auth/api/v1/users/me", { token: t.access_token });
  const biz = me.response.business_memberships[0]?.business;
  if (!biz) throw new Error("No FreshBooks business found");
  return { account: biz.name, extra: { account_id: biz.account_id } };
}
