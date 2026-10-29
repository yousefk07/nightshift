import type { Connection } from "../types";
import { api } from "./http";

// The business's Shopify store, through a custom app's Admin API token.

const version = () => process.env.SHOPIFY_API_VERSION || "2026-07";
const DAY = 86_400_000;

function base(conn: Connection) {
  const shop = conn.account.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) throw new Error("The Shopify store should look like your-store.myshopify.com.");
  return `https://${shop}/admin/api/${version()}`;
}
const get = <T>(conn: Connection, path: string) => api<T>(`${base(conn)}${path}`, { headers: { "X-Shopify-Access-Token": String(conn.secret.token) } });

export interface Order {
  id: number;
  name: string;
  customer: string;
  email: string | null;
  total: number;
  currency: string;
  paid: string;
  fulfilled: string;
  createdAt: string;
  daysOpen: number;
}

const toOrder = (o: any): Order => ({
  id: o.id,
  name: o.name,
  customer: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || o.email || "unknown",
  email: o.email ?? null,
  total: Number(o.total_price),
  currency: o.currency,
  paid: o.financial_status,
  fulfilled: o.fulfillment_status ?? "unfulfilled",
  createdAt: o.created_at,
  daysOpen: Math.floor((Date.now() - new Date(o.created_at).getTime()) / DAY),
});

export async function listOrders(conn: Connection, opts: { since?: string; filter?: "paid" | "unpaid" | "unfulfilled" | "any"; max?: number } = {}) {
  const q = new URLSearchParams({ status: "any", limit: String(Math.min(opts.max ?? 50, 250)), fields: "id,name,email,total_price,currency,financial_status,fulfillment_status,created_at,customer" });
  if (opts.since) q.set("created_at_min", new Date(opts.since).toISOString());
  if (opts.filter === "paid") q.set("financial_status", "paid");
  if (opts.filter === "unpaid") { q.set("financial_status", "unpaid"); q.set("status", "open"); }
  if (opts.filter === "unfulfilled") { q.set("fulfillment_status", "unfulfilled"); q.set("status", "open"); }
  return (await get<{ orders: any[] }>(conn, `/orders.json?${q}`)).orders.map(toOrder);
}

export async function lowStock(conn: Connection, threshold = 5) {
  const r = await get<{ products: any[] }>(conn, `/products.json?limit=250&status=active&fields=id,title,variants`);
  return r.products.flatMap((p) =>
    p.variants
      .filter((v: any) => v.inventory_management && v.inventory_quantity <= threshold)
      .map((v: any) => ({ product: p.title, variant: v.title === "Default Title" ? "" : v.title, sku: v.sku, inStock: v.inventory_quantity })),
  );
}
