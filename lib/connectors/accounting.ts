import type { Store } from "../store";
import type { Connection } from "../types";
import { api, form } from "./http";
import { accessToken } from "./oauth";

// One shape over QuickBooks Online, Xero, FreshBooks and Stripe. Amounts are in the currency's main unit.

export interface Invoice {
  id: string;
  number: string | null;
  customer: string;
  customerId: string | null;
  email: string | null;
  total: number;
  amountDue: number;
  currency: string;
  dueDate: string | null; // YYYY-MM-DD
  daysOverdue: number;
  status: "open" | "overdue" | "paid" | "draft" | "void";
  url: string | null;
}

export interface Payment {
  id: string;
  customer: string;
  amount: number;
  currency: string;
  date: string;
  invoiceIds: string[];
}

export interface NewLine {
  description: string;
  amount: number; // unit price
  quantity?: number;
}

export interface Accounting {
  provider: Connection["provider"];
  listInvoices(status: "open" | "overdue" | "paid" | "all", max?: number): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice & { lines: { description: string; amount: number }[] }>;
  listPayments(since: string, max?: number): Promise<Payment[]>;
  sendReminder(id: string): Promise<{ sent: true }>;
  createInvoice(i: { customer: string; email?: string; lines: NewLine[]; dueInDays?: number; currency?: string; memo?: string }): Promise<{ id: string; number: string | null; url: string | null }>;
  createCreditNote(c: { invoiceId: string; amount: number; reason: string }): Promise<{ id: string; number: string | null }>;
}

const DAY = 86_400_000;
const daysPast = (date: string | null) => (date ? Math.max(0, Math.floor((Date.now() - new Date(date + "T23:59:59Z").getTime()) / DAY)) : 0);
const ymd = (d: Date | string | number) => new Date(d).toISOString().slice(0, 10);
const plus = (days: number) => ymd(Date.now() + days * DAY);
function statusOf(amountDue: number, dueDate: string | null, voided = false): Invoice["status"] {
  if (voided) return "void";
  if (amountDue <= 0) return "paid";
  return daysPast(dueDate) > 0 ? "overdue" : "open";
}
const keep = (status: "open" | "overdue" | "paid" | "all") => (i: Invoice) =>
  status === "all" || i.status === status || (status === "open" && i.status === "overdue");

export function accountingFor(store: Store, conn: Connection): Accounting {
  switch (conn.provider) {
    case "stripe": return stripe(conn);
    case "quickbooks": return quickbooks(store, conn);
    case "xero": return xero(store, conn);
    case "freshbooks": return freshbooks(store, conn);
    default: throw new Error(`${conn.provider} isn't an accounting connection`);
  }
}

// ---------------- Stripe ----------------
function stripe(conn: Connection): Accounting {
  const key = String(conn.secret.key);
  const S = "https://api.stripe.com/v1";
  const get = <T = any>(path: string) => api<T>(`${S}${path}`, { token: key });
  const post = <T = any>(path: string, data: Record<string, string> = {}) => api<T>(`${S}${path}`, { method: "POST", token: key, ...form(data) });
  const map = (i: any): Invoice => {
    const due = i.due_date ? ymd(i.due_date * 1000) : null;
    return {
      id: i.id, number: i.number, customer: i.customer_name ?? i.customer_email ?? i.customer, customerId: typeof i.customer === "string" ? i.customer : i.customer?.id ?? null,
      email: i.customer_email, total: i.total / 100, amountDue: i.amount_remaining / 100, currency: i.currency.toUpperCase(), dueDate: due,
      daysOverdue: i.amount_remaining > 0 ? daysPast(due) : 0, status: i.status === "draft" ? "draft" : statusOf(i.amount_remaining, due, i.status === "void" || i.status === "uncollectible"), url: i.hosted_invoice_url,
    };
  };
  return {
    provider: "stripe",
    async listInvoices(status, max = 50) {
      const s = status === "paid" ? "&status=paid" : status === "all" ? "" : "&status=open";
      return (await get<{ data: any[] }>(`/invoices?limit=${Math.min(max, 100)}${s}`)).data.map(map).filter(keep(status));
    },
    async getInvoice(id) {
      const i = await get(`/invoices/${encodeURIComponent(id)}?expand[]=lines`);
      return { ...map(i), lines: i.lines.data.map((l: any) => ({ description: l.description ?? "", amount: l.amount / 100 })) };
    },
    async listPayments(since, max = 50) {
      const r = await get<{ data: any[] }>(`/charges?limit=${Math.min(max, 100)}&created[gte]=${Math.floor(new Date(since).getTime() / 1000)}`);
      return r.data.filter((c) => c.paid && !c.refunded).map((c) => ({ id: c.id, customer: c.billing_details?.name ?? c.receipt_email ?? c.customer ?? "", amount: c.amount / 100, currency: c.currency.toUpperCase(), date: ymd(c.created * 1000), invoiceIds: c.invoice ? [c.invoice] : [] }));
    },
    async sendReminder(id) {
      if (!/^in_[A-Za-z0-9]+$/.test(id)) throw new Error("That isn't a Stripe invoice id.");
      await post(`/invoices/${id}/send`);
      return { sent: true };
    },
    async createInvoice({ customer, email, lines, dueInDays = 14, currency = "usd", memo }) {
      let cust = email ? (await get<{ data: any[] }>(`/customers?email=${encodeURIComponent(email)}&limit=1`)).data[0] : null;
      cust ??= await post("/customers", { name: customer, ...(email ? { email } : {}) });
      const inv = await post("/invoices", { customer: cust.id, collection_method: "send_invoice", days_until_due: String(dueInDays), currency, ...(memo ? { description: memo } : {}) });
      for (const l of lines) await post("/invoiceitems", { customer: cust.id, invoice: inv.id, description: l.description, unit_amount: String(Math.round(l.amount * 100)), quantity: String(l.quantity ?? 1), currency });
      await post(`/invoices/${inv.id}/finalize`);
      const sent = await post(`/invoices/${inv.id}/send`);
      return { id: sent.id, number: sent.number, url: sent.hosted_invoice_url };
    },
    async createCreditNote({ invoiceId, amount, reason }) {
      const cn = await post("/credit_notes", {
        invoice: invoiceId, memo: reason,
        "lines[0][type]": "custom_line_item", "lines[0][description]": reason.slice(0, 200), "lines[0][quantity]": "1", "lines[0][unit_amount]": String(Math.round(amount * 100)),
      });
      return { id: cn.id, number: cn.number };
    },
  };
}

// ---------------- QuickBooks Online ----------------
function quickbooks(store: Store, conn: Connection): Accounting {
  const realm = String(conn.secret.realm_id);
  const base = `${process.env.QBO_SANDBOX === "1" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com"}/v3/company/${realm}`;
  const call = async <T = any>(path: string, init: { method?: string; json?: unknown } = {}) =>
    api<T>(`${base}${path}${path.includes("?") ? "&" : "?"}minorversion=75`, { ...init, token: await accessToken(store, conn), headers: { Accept: "application/json" } });
  const query = async (sql: string) => (await call<{ QueryResponse: Record<string, any[]> }>(`/query?query=${encodeURIComponent(sql)}`)).QueryResponse;
  const map = (i: any): Invoice => ({
    id: i.Id, number: i.DocNumber ?? null, customer: i.CustomerRef?.name ?? "", customerId: i.CustomerRef?.value ?? null, email: i.BillEmail?.Address ?? null,
    total: Number(i.TotalAmt), amountDue: Number(i.Balance), currency: i.CurrencyRef?.value ?? "USD", dueDate: i.DueDate ?? null,
    daysOverdue: Number(i.Balance) > 0 ? daysPast(i.DueDate ?? null) : 0, status: statusOf(Number(i.Balance), i.DueDate ?? null), url: i.InvoiceLink ?? null,
  });
  const serviceItem = async () => (await query("select Id from Item where Type = 'Service' maxresults 1")).Item?.[0]?.Id ?? "1";
  return {
    provider: "quickbooks",
    async listInvoices(status, max = 50) {
      const where = status === "paid" ? "where Balance = '0'" : status === "all" ? "" : "where Balance > '0'";
      return ((await query(`select * from Invoice ${where} orderby DueDate maxresults ${Math.min(max, 100)}`)).Invoice ?? []).map(map).filter(keep(status));
    },
    async getInvoice(id) {
      const i = (await call<{ Invoice: any }>(`/invoice/${encodeURIComponent(id)}?include=invoiceLink`)).Invoice;
      return { ...map(i), lines: (i.Line ?? []).filter((l: any) => l.DetailType === "SalesItemLineDetail").map((l: any) => ({ description: l.Description ?? "", amount: Number(l.Amount) })) };
    },
    async listPayments(since, max = 50) {
      const rows = (await query(`select * from Payment where TxnDate >= '${ymd(since)}' maxresults ${Math.min(max, 100)}`)).Payment ?? [];
      return rows.map((p) => ({
        id: p.Id, customer: p.CustomerRef?.name ?? "", amount: Number(p.TotalAmt), currency: p.CurrencyRef?.value ?? "USD", date: p.TxnDate,
        invoiceIds: (p.Line ?? []).flatMap((l: any) => (l.LinkedTxn ?? []).filter((t: any) => t.TxnType === "Invoice").map((t: any) => t.TxnId)),
      }));
    },
    async sendReminder(id) {
      await call(`/invoice/${encodeURIComponent(id)}/send`, { method: "POST" });
      return { sent: true };
    },
    async createInvoice({ customer, email, lines, dueInDays = 14, memo }) {
      const name = customer.replace(/'/g, "\\'");
      let cust = (await query(`select Id, DisplayName from Customer where DisplayName = '${name}'`)).Customer?.[0];
      cust ??= (await call<{ Customer: any }>("/customer", { method: "POST", json: { DisplayName: customer, ...(email ? { PrimaryEmailAddr: { Address: email } } : {}) } })).Customer;
      const item = await serviceItem();
      const inv = (await call<{ Invoice: any }>("/invoice", {
        method: "POST",
        json: {
          CustomerRef: { value: cust.Id }, DueDate: plus(dueInDays), ...(email ? { BillEmail: { Address: email } } : {}), ...(memo ? { CustomerMemo: { value: memo } } : {}),
          Line: lines.map((l) => ({ Amount: Math.round(l.amount * (l.quantity ?? 1) * 100) / 100, Description: l.description, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: item }, Qty: l.quantity ?? 1, UnitPrice: l.amount } })),
        },
      })).Invoice;
      await call(`/invoice/${inv.Id}/send`, { method: "POST" });
      return { id: inv.Id, number: inv.DocNumber ?? null, url: null };
    },
    async createCreditNote({ invoiceId, amount, reason }) {
      const inv = (await call<{ Invoice: any }>(`/invoice/${encodeURIComponent(invoiceId)}`)).Invoice;
      const memo = (await call<{ CreditMemo: any }>("/creditmemo", {
        method: "POST",
        json: { CustomerRef: inv.CustomerRef, PrivateNote: `Against invoice ${inv.DocNumber ?? inv.Id}: ${reason}`, Line: [{ Amount: amount, Description: reason, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: await serviceItem() } } }] },
      })).CreditMemo;
      return { id: memo.Id, number: memo.DocNumber ?? null };
    },
  };
}

// ---------------- Xero ----------------
function xero(store: Store, conn: Connection): Accounting {
  const X = "https://api.xero.com/api.xro/2.0";
  const tenant = String(conn.secret.tenant_id);
  const call = async <T = any>(path: string, init: { method?: string; json?: unknown } = {}) =>
    api<T>(`${X}${path}`, { ...init, token: await accessToken(store, conn), headers: { "Xero-tenant-id": tenant, Accept: "application/json" } });
  const date = (d: string | undefined) => {
    const m = d?.match(/\/Date\((\d+)/);
    return m ? ymd(Number(m[1])) : d ? d.slice(0, 10) : null;
  };
  const map = (i: any): Invoice => {
    const due = date(i.DueDateString ?? i.DueDate);
    return {
      id: i.InvoiceID, number: i.InvoiceNumber ?? null, customer: i.Contact?.Name ?? "", customerId: i.Contact?.ContactID ?? null, email: i.Contact?.EmailAddress ?? null,
      total: Number(i.Total), amountDue: Number(i.AmountDue), currency: i.CurrencyCode ?? "USD", dueDate: due,
      daysOverdue: Number(i.AmountDue) > 0 ? daysPast(due) : 0, status: i.Status === "DRAFT" ? "draft" : statusOf(Number(i.AmountDue), due, i.Status === "VOIDED"), url: null,
    };
  };
  const account = process.env.XERO_SALES_ACCOUNT || "200";
  return {
    provider: "xero",
    async listInvoices(status) {
      const statuses = status === "paid" ? "PAID" : status === "all" ? "AUTHORISED,PAID" : "AUTHORISED";
      const r = await call<{ Invoices: any[] }>(`/Invoices?Statuses=${statuses}&where=${encodeURIComponent('Type=="ACCREC"')}&order=DueDate`);
      return r.Invoices.map(map).filter(keep(status));
    },
    async getInvoice(id) {
      const i = (await call<{ Invoices: any[] }>(`/Invoices/${encodeURIComponent(id)}`)).Invoices[0];
      const online = await call<{ OnlineInvoices: { OnlineInvoiceUrl: string }[] }>(`/Invoices/${encodeURIComponent(id)}/OnlineInvoice`).catch(() => null);
      return { ...map(i), url: online?.OnlineInvoices?.[0]?.OnlineInvoiceUrl ?? null, lines: (i.LineItems ?? []).map((l: any) => ({ description: l.Description ?? "", amount: Number(l.LineAmount) })) };
    },
    async listPayments(since) {
      const d = new Date(since);
      const r = await call<{ Payments: any[] }>(`/Payments?where=${encodeURIComponent(`Date>=DateTime(${d.getUTCFullYear()},${d.getUTCMonth() + 1},${d.getUTCDate()})`)}`);
      return r.Payments.filter((p) => p.Status === "AUTHORISED").map((p) => ({ id: p.PaymentID, customer: p.Invoice?.Contact?.Name ?? "", amount: Number(p.Amount), currency: p.Invoice?.CurrencyCode ?? "USD", date: date(p.Date) ?? "", invoiceIds: p.Invoice?.InvoiceID ? [p.Invoice.InvoiceID] : [] }));
    },
    async sendReminder(id) {
      await call(`/Invoices/${encodeURIComponent(id)}/Email`, { method: "POST", json: {} });
      return { sent: true };
    },
    async createInvoice({ customer, email, lines, dueInDays = 14, currency, memo }) {
      const r = await call<{ Invoices: any[] }>("/Invoices", {
        method: "POST",
        json: { Invoices: [{ Type: "ACCREC", Contact: { Name: customer, ...(email ? { EmailAddress: email } : {}) }, DueDate: plus(dueInDays), Reference: memo, CurrencyCode: currency?.toUpperCase(), Status: "AUTHORISED", LineItems: lines.map((l) => ({ Description: l.description, Quantity: l.quantity ?? 1, UnitAmount: l.amount, AccountCode: account })) }] },
      });
      const inv = r.Invoices[0];
      await call(`/Invoices/${inv.InvoiceID}/Email`, { method: "POST", json: {} });
      return { id: inv.InvoiceID, number: inv.InvoiceNumber ?? null, url: null };
    },
    async createCreditNote({ invoiceId, amount, reason }) {
      const inv = (await call<{ Invoices: any[] }>(`/Invoices/${encodeURIComponent(invoiceId)}`)).Invoices[0];
      const cn = (await call<{ CreditNotes: any[] }>("/CreditNotes", {
        method: "PUT",
        json: { CreditNotes: [{ Type: "ACCRECCREDIT", Contact: { ContactID: inv.Contact.ContactID }, Reference: `Against ${inv.InvoiceNumber}: ${reason}`.slice(0, 255), Status: "AUTHORISED", CurrencyCode: inv.CurrencyCode, LineItems: [{ Description: reason, Quantity: 1, UnitAmount: amount, AccountCode: account }] }] },
      })).CreditNotes[0];
      await call(`/CreditNotes/${cn.CreditNoteID}/Allocations`, { method: "PUT", json: { Allocations: [{ Invoice: { InvoiceID: inv.InvoiceID }, Amount: amount, Date: ymd(Date.now()) }] } });
      return { id: cn.CreditNoteID, number: cn.CreditNoteNumber ?? null };
    },
  };
}

// ---------------- FreshBooks ----------------
function freshbooks(store: Store, conn: Connection): Accounting {
  const acct = String(conn.secret.account_id);
  const F = `https://api.freshbooks.com/accounting/account/${acct}`;
  const call = async <T = any>(path: string, init: { method?: string; json?: unknown } = {}) =>
    (await api<{ response: { result: T } }>(`${F}${path}`, { ...init, token: await accessToken(store, conn), headers: { "Api-Version": "alpha" } })).response.result;
  const map = (i: any): Invoice => {
    const due = i.due_date ?? null;
    const amountDue = Number(i.outstanding?.amount ?? 0);
    return {
      id: String(i.invoiceid ?? i.id), number: i.invoice_number ?? null, customer: i.current_organization || [i.fname, i.lname].filter(Boolean).join(" "), customerId: i.customerid ? String(i.customerid) : null,
      email: i.email ?? null, total: Number(i.amount?.amount ?? 0), amountDue, currency: i.amount?.code ?? "USD", dueDate: due,
      daysOverdue: amountDue > 0 ? daysPast(due) : 0, status: i.v3_status === "draft" ? "draft" : statusOf(amountDue, due, i.vis_state === 1), url: null,
    };
  };
  const clientId = async (name: string, email?: string) => {
    if (email) {
      const r = await call<{ clients: any[] }>(`/users/clients?search[email]=${encodeURIComponent(email)}`);
      if (r.clients[0]) return r.clients[0].id;
    }
    const c = await call<{ client: any }>("/users/clients", { method: "POST", json: { client: { organization: name, email } } });
    return c.client.id;
  };
  return {
    provider: "freshbooks",
    async listInvoices(status, max = 50) {
      const filter = status === "paid" ? "&search[payment_status]=paid" : status === "all" ? "" : "&search[payment_status]=unpaid&search[payment_status]=partial";
      const r = await call<{ invoices: any[] }>(`/invoices/invoices?per_page=${Math.min(max, 100)}${filter}`);
      return r.invoices.map(map).filter(keep(status));
    },
    async getInvoice(id) {
      const r = await call<{ invoice: any }>(`/invoices/invoices/${encodeURIComponent(id)}?include[]=lines`);
      return { ...map(r.invoice), lines: (r.invoice.lines ?? []).map((l: any) => ({ description: l.name ?? l.description ?? "", amount: Number(l.amount?.amount ?? 0) })) };
    },
    async listPayments(since, max = 50) {
      const r = await call<{ payments: any[] }>(`/payments/payments?per_page=${Math.min(max, 100)}&search[date_min]=${ymd(since)}`);
      return r.payments.map((p) => ({ id: String(p.id), customer: "", amount: Number(p.amount?.amount ?? 0), currency: p.amount?.code ?? "USD", date: p.date, invoiceIds: p.invoiceid ? [String(p.invoiceid)] : [] }));
    },
    async sendReminder(id) {
      const inv = (await call<{ invoice: any }>(`/invoices/invoices/${encodeURIComponent(id)}`)).invoice;
      await call(`/invoices/invoices/${encodeURIComponent(id)}`, { method: "PUT", json: { invoice: { action_email: true, email_recipients: [inv.email].filter(Boolean) } } });
      return { sent: true };
    },
    async createInvoice({ customer, email, lines, dueInDays = 14, currency = "USD", memo }) {
      const customerid = await clientId(customer, email);
      const r = await call<{ invoice: any }>("/invoices/invoices", {
        method: "POST",
        json: { invoice: { customerid, create_date: ymd(Date.now()), due_offset_days: dueInDays, currency_code: currency.toUpperCase(), notes: memo ?? "", lines: lines.map((l) => ({ type: 0, name: l.description, qty: l.quantity ?? 1, unit_cost: { amount: String(l.amount), code: currency.toUpperCase() } })) } },
      });
      await call(`/invoices/invoices/${r.invoice.id}`, { method: "PUT", json: { invoice: { action_email: true, email_recipients: [email].filter(Boolean) } } });
      return { id: String(r.invoice.id), number: r.invoice.invoice_number ?? null, url: null };
    },
    async createCreditNote({ invoiceId, amount, reason }) {
      const inv = (await call<{ invoice: any }>(`/invoices/invoices/${encodeURIComponent(invoiceId)}`)).invoice;
      const r = await call<{ credit_note: any }>("/credit_notes/credit_notes", {
        method: "POST",
        json: { credit_note: { customerid: inv.customerid, create_date: ymd(Date.now()), currency_code: inv.amount?.code ?? "USD", notes: `Against invoice ${inv.invoice_number}: ${reason}`, lines: [{ name: reason.slice(0, 100), qty: 1, unit_cost: { amount: String(amount) } }] } },
      });
      return { id: String(r.credit_note.creditid ?? r.credit_note.id), number: r.credit_note.credit_number ?? null };
    },
  };
}
