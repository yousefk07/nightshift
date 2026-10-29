import { z } from "zod";
import { body, HttpError, requireOwner, route } from "@/lib/auth";
import { signState } from "@/lib/crypto";
import { accountingFor } from "@/lib/connectors/accounting";
import { hubspotPull, sheetId, sheetsPull } from "@/lib/connectors/crm";
import { authorizeUrl, isOAuthProvider, OAUTH, redirectUri } from "@/lib/connectors/oauth";
import { listOrders } from "@/lib/connectors/shopify";
import { limits } from "@/lib/plans";
import { supabaseStore } from "@/lib/store-supabase";
import type { Connection } from "@/lib/types";

type Ctx = { params: Promise<{ provider: string }> };

async function inboxRoom(wsId: string, ws: Parameters<typeof limits>[0]) {
  const conns = await supabaseStore().connections(wsId);
  if (conns.filter((c) => c.kinds.includes("email")).length >= limits(ws).inboxes) throw new HttpError(402, `Your plan includes ${limits(ws).inboxes} inbox${limits(ws).inboxes === 1 ? "" : "es"}.`);
}

// GET /api/connect/<google|microsoft|quickbooks|xero|freshbooks>: off to the provider's consent screen.
export const GET = route<Ctx>(async (req, me, { params }) => {
  requireOwner(me);
  const { provider } = await params;
  if (!isOAuthProvider(provider)) throw new HttpError(404, "Use POST for Stripe, Shopify, HubSpot and Google Sheets.");
  if (!OAUTH[provider].clientId()) throw new HttpError(500, `${OAUTH[provider].label} sign-in isn't set up on the server yet.`);
  if (provider === "google" || provider === "microsoft") await inboxRoom(me.ws.id, me.ws);
  const back = new URL(req.url).searchParams.get("return");
  const state = signState({ ws: me.ws.id, u: me.userId, p: provider, r: back?.startsWith("/") && !back.startsWith("//") ? back : "/settings/connections" });
  return Response.redirect(authorizeUrl(provider, redirectUri(req, provider), state), 302);
});

const Keys = {
  stripe: z.object({ key: z.string().regex(/^(rk|sk)_(live|test)_[A-Za-z0-9]+$/, "Paste a Stripe restricted key (rk_live_...)") }),
  shopify: z.object({ shop: z.string().regex(/^[a-z0-9-]+\.myshopify\.com$/i, "The store should look like your-store.myshopify.com"), token: z.string().regex(/^shpat_[A-Za-z0-9]+$/, "Paste an Admin API access token (shpat_...)") }),
  hubspot: z.object({ token: z.string().regex(/^pat-[a-z0-9]+-[A-Za-z0-9-]+$/, "Paste a HubSpot private app token (pat-...)") }),
  sheets: z.object({ url: z.string().url().refine((u) => !!sheetId(u), "Paste the link to the Google Sheet") }),
};

// POST /api/connect/stripe {key} | /shopify {shop, token} | /hubspot {token} | /sheets {url}. Each is tested with
// a real read before it's saved (encrypted).
export const POST = route<Ctx>(async (req, me, { params }) => {
  requireOwner(me);
  const { provider } = await params;
  const store = supabaseStore();
  const probe = (c: Omit<Connection, "id">) => ({ id: "", ...c });
  const fail = (label: string) => (e: Error) => { throw new HttpError(400, `${label} said no: ${e.message}`); };

  if (provider === "stripe") {
    const { key } = await body(req, (v) => Keys.stripe.parse(v));
    const conn = probe({ workspace_id: me.ws.id, provider: "stripe", kinds: ["accounting"], account: key.includes("_test_") ? "Stripe (test)" : "Stripe", secret: { key }, status: "ok" });
    await accountingFor(store, conn).listInvoices("open", 1).catch(fail("Stripe"));
    await store.saveConnection(me.ws.id, "stripe", conn.kinds, conn.account, conn.secret);
    return Response.json({ connected: "stripe" });
  }
  if (provider === "shopify") {
    const { shop, token } = await body(req, (v) => Keys.shopify.parse(v));
    const conn = probe({ workspace_id: me.ws.id, provider: "shopify", kinds: ["store"], account: shop.toLowerCase(), secret: { token }, status: "ok" });
    await listOrders(conn, { max: 1 }).catch(fail("Shopify"));
    await store.saveConnection(me.ws.id, "shopify", conn.kinds, conn.account, conn.secret);
    return Response.json({ connected: "shopify", shop: conn.account });
  }
  if (provider === "hubspot") {
    const { token } = await body(req, (v) => Keys.hubspot.parse(v));
    const conn = probe({ workspace_id: me.ws.id, provider: "hubspot", kinds: ["crm"], account: "HubSpot", secret: { token }, status: "ok" });
    const n = await hubspotPull(store, conn).catch(fail("HubSpot"));
    await store.saveConnection(me.ws.id, "hubspot", conn.kinds, conn.account, conn.secret);
    return Response.json({ connected: "hubspot", contacts: n });
  }
  if (provider === "sheets") {
    const { url } = await body(req, (v) => Keys.sheets.parse(v));
    const google = (await store.connections(me.ws.id)).find((c) => c.provider === "google" && c.status === "ok");
    if (!google) throw new HttpError(400, "Connect Google first: the sheet is read with your Google sign-in.");
    const conn = probe({ workspace_id: me.ws.id, provider: "sheets", kinds: ["crm"], account: `Sheet ${sheetId(url)!.slice(0, 8)}`, secret: { sheet_id: sheetId(url), url }, status: "ok" });
    const n = await sheetsPull(store, conn as Connection, google).catch(fail("Google Sheets"));
    await store.saveConnection(me.ws.id, "sheets", conn.kinds, conn.account, conn.secret);
    return Response.json({ connected: "sheets", contacts: n });
  }
  throw new HttpError(404, "Unknown provider.");
});
