import type { Connection } from "../types";
import { api, form } from "./http";

// The business's own Stripe and Shopify, read through keys the owner pastes in settings
// (a Stripe restricted key; a Shopify custom-app Admin API token).

export interface OpenInvoice {
  id: string;
  number: string | null;
  customer: string;
  email: string | null;
  amountDue: number; // in the currency's main unit
  currency: string;
  dueDate: string | null;
  daysOverdue: number;
  url: string | null;
  canSend: boolean; // Stripe only emails invoices that are billed by sending
}

const days = (from: number) => Math.max(0, Math.floor((Date.now() - from) / 86_400_000));

export async function stripeOpenInvoices(conn: Connection, max = 50): Promise<OpenInvoice[]> {
  const key = String(conn.secret.key);
  const r = await api<{ data: any[] }>(`https://api.stripe.com/v1/invoices?status=open&limit=${Math.min(max, 100)}`, { token: key });
  return r.data.map((i) => ({
    id: i.id,
    number: i.number,
    customer: i.customer_name ?? i.customer_email ?? i.customer,
    email: i.customer_email,
    amountDue: i.amount_remaining / 100,
    currency: i.currency.toUpperCase(),
    dueDate: i.due_date ? new Date(i.due_date * 1000).toISOString().slice(0, 10) : null,
    daysOverdue: i.due_date ? days(i.due_date * 1000) : 0,
    url: i.hosted_invoice_url,
    canSend: i.collection_method === "send_invoice",
  }));
}

// Stripe emails the customer the invoice again, with its pay link.
export async function stripeSendInvoice(conn: Connection, invoiceId: string) {
  if (!/^in_[A-Za-z0-9]+$/.test(invoiceId)) throw new Error("That isn't a Stripe invoice id.");
  const r = await api<{ id: string; status: string }>(`https://api.stripe.com/v1/invoices/${invoiceId}/send`, { method: "POST", token: String(conn.secret.key), ...form({}) });
  return { id: r.id, status: r.status };
}

export interface UnpaidOrder {
  id: number;
  name: string;
  customer: string;
  email: string | null;
  total: number;
  currency: string;
  status: string;
  createdAt: string;
  daysOpen: number;
}

const shopifyVersion = () => process.env.SHOPIFY_API_VERSION || "2026-07";

export async function shopifyUnpaidOrders(conn: Connection, max = 50): Promise<UnpaidOrder[]> {
  const shop = conn.account.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) throw new Error("The Shopify store should look like your-store.myshopify.com.");
  const q = new URLSearchParams({ status: "open", financial_status: "unpaid", limit: String(Math.min(max, 250)), fields: "id,name,email,total_price,currency,financial_status,created_at,customer" });
  const r = await api<{ orders: any[] }>(`https://${shop}/admin/api/${shopifyVersion()}/orders.json?${q}`, { headers: { "X-Shopify-Access-Token": String(conn.secret.token) } });
  return r.orders.map((o) => ({
    id: o.id,
    name: o.name,
    customer: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || o.email || "unknown",
    email: o.email ?? null,
    total: Number(o.total_price),
    currency: o.currency,
    status: o.financial_status,
    createdAt: o.created_at,
    daysOpen: days(new Date(o.created_at).getTime()),
  }));
}
