import { connection } from "next/server";
import { readState } from "@/lib/crypto";
import { accountDetails, exchangeCode, isOAuthProvider, OAUTH, redirectUri } from "@/lib/connectors/oauth";
import { supabaseStore } from "@/lib/store-supabase";

// Where the provider sends the owner back after they agree. The signed state says which workspace.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  await connection();
  const { provider } = await params;
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(`${process.env.APP_URL ?? url.origin}/settings/connections?${q}`, 302);
  if (!isOAuthProvider(provider)) return back("connect_error=unknown");
  if (url.searchParams.get("error")) return back(`connect_error=${encodeURIComponent(url.searchParams.get("error")!)}`);
  try {
    const state = readState<{ ws: string; p: string }>(url.searchParams.get("state") ?? "");
    if (state.p !== provider) throw new Error("Mixed-up sign-in");
    const t = await exchangeCode(provider, url.searchParams.get("code") ?? "", redirectUri(req, provider));
    if (!t.refresh_token) throw new Error("No offline access was granted");
    const { account, extra } = await accountDetails(provider, t, url.searchParams);
    const { id_token: _id, ...tokens } = t;
    const store = supabaseStore();
    await store.saveConnection(state.ws, provider, OAUTH[provider].kinds, account, { ...tokens, ...extra }, OAUTH[provider].scopes);
    await store.log(state.ws, { actor_type: "system", action: "connected", target: `${OAUTH[provider].label} · ${account}` });
    return back(`connected=${provider}`);
  } catch (e) {
    return back(`connect_error=${encodeURIComponent((e as Error).message)}`);
  }
}
