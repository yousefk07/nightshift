import { z } from "zod";
import { body, HttpError, route } from "@/lib/auth";
import { signState } from "@/lib/crypto";
import { authorizeUrl, OAUTH, redirectUri, type OAuthProvider } from "@/lib/connectors/oauth";
import { stripeOpenInvoices, shopifyUnpaidOrders } from "@/lib/connectors/commerce";
import { supabaseStore } from "@/lib/store-supabase";

type Ctx = { params: Promise<{ provider: string }> };

// GET /api/connect/google or /microsoft: off to the provider's consent screen.
export const GET = route<Ctx>(async (req, me, { params }) => {
  const { provider } = await params;
  if (!(provider in OAUTH)) throw new HttpError(404, "Use POST for Stripe and Shopify keys.");
  if (!OAUTH[provider as OAuthProvider].clientId()) throw new HttpError(500, `${provider} sign-in isn't set up on the server yet.`);
  const state = signState({ ws: me.ws.id, u: me.userId, p: provider });
  return Response.redirect(authorizeUrl(provider as OAuthProvider, redirectUri(req, provider), state), 302);
});

const Keys = {
  stripe: z.object({ key: z.string().regex(/^(rk|sk)_(live|test)_[A-Za-z0-9]+$/, "Paste a Stripe restricted key (rk_live_...)") }),
  shopify: z.object({ shop: z.string().regex(/^[a-z0-9-]+\.myshopify\.com$/i, "The store should look like your-store.myshopify.com"), token: z.string().regex(/^shpat_[A-Za-z0-9]+$/, "Paste an Admin API access token (shpat_...)") }),
};

// POST /api/connect/stripe {key} or /shopify {shop, token}: saved encrypted after a test call proves it works.
export const POST = route<Ctx>(async (req, me, { params }) => {
  const { provider } = await params;
  const store = supabaseStore();
  if (provider === "stripe") {
    const { key } = await body(req, (v) => Keys.stripe.parse(v));
    const conn = { id: "", workspace_id: me.ws.id, provider: "stripe" as const, account: key.includes("_test_") ? "stripe-test" : "stripe", secret: { key }, status: "ok" as const };
    await stripeOpenInvoices(conn, 1).catch((e) => { throw new HttpError(400, `Stripe said no: ${e.message}`); });
    await store.saveConnection(me.ws.id, "stripe", conn.account, conn.secret);
    return Response.json({ connected: "stripe" });
  }
  if (provider === "shopify") {
    const { shop, token } = await body(req, (v) => Keys.shopify.parse(v));
    const conn = { id: "", workspace_id: me.ws.id, provider: "shopify" as const, account: shop.toLowerCase(), secret: { token }, status: "ok" as const };
    await shopifyUnpaidOrders(conn, 1).catch((e) => { throw new HttpError(400, `Shopify said no: ${e.message}`); });
    await store.saveConnection(me.ws.id, "shopify", conn.account, conn.secret);
    return Response.json({ connected: "shopify", shop: conn.account });
  }
  throw new HttpError(404, "Unknown provider.");
});
