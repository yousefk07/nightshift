import { readState } from "@/lib/crypto";
import { emailFromIdToken, exchangeCode, OAUTH, redirectUri, type OAuthProvider } from "@/lib/connectors/oauth";
import { supabaseStore } from "@/lib/store-supabase";

// Where Google and Microsoft send the owner back after they agree. The signed state says which workspace.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(`${process.env.APP_URL ?? url.origin}/?${q}`, 302);
  if (!(provider in OAUTH)) return back("connect_error=unknown");
  if (url.searchParams.get("error")) return back(`connect_error=${encodeURIComponent(url.searchParams.get("error")!)}`);
  try {
    const state = readState<{ ws: string; p: string }>(url.searchParams.get("state") ?? "");
    if (state.p !== provider) throw new Error("Mixed-up sign-in");
    const t = await exchangeCode(provider as OAuthProvider, url.searchParams.get("code") ?? "", redirectUri(req, provider));
    if (!t.refresh_token) throw new Error("No offline access was granted");
    const account = emailFromIdToken(t.id_token) ?? provider;
    const { id_token: _id, ...secret } = t;
    await supabaseStore().saveConnection(state.ws, provider as OAuthProvider, account, secret, OAUTH[provider as OAuthProvider].scopes);
    return back(`connected=${provider}`);
  } catch (e) {
    return back(`connect_error=${encodeURIComponent((e as Error).message)}`);
  }
}
