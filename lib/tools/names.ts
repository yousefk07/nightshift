// Every tool a bot template may list, with what it does and its approval class:
//   quiet   = reads, notes, flags, drafts, internal records: always runs.
//   message = sends something to a person (email, invite, reminder): follows the bot's "ask me / just do it" switch.
//   money   = moves or commits money (credit notes, invoices, refunds): ALWAYS waits for the owner's approval.
// lib/tools/index.ts implements them; test/catalog.test.ts checks every template only uses these.

export const TOOL_NAMES = {
  // team
  post_to_room: "quiet · post an update in the bot room",
  hand_off: "quiet · give a teammate a job",
  flag: "quiet · flag something for the owner (importance 1-3)",
  notify_owner: "quiet · alert the owner right away (respects quiet hours; disputes and complaints break through)",
  review_activity: "quiet · what the team did recently, open flags, waiting approvals",
  save_brief: "quiet · save the morning brief",
  save_document: "quiet · save a deliverable for the owner (report, quote, proposal, post, SOP, checklist, script)",
  remember: "quiet · add a fact to the team's shared memory",
  recall: "quiet · search the team's shared memory",
  place_hold: "quiet · pause the team's outreach to a contact or company (with reason and optional resume date)",
  list_holds: "quiet · holds in place",
  // email
  search_email: "quiet · search the mailbox",
  read_email: "quiet · read one email",
  label_email: "quiet · file an email under a label",
  draft_reply: "quiet · save a reply as a draft in the mailbox",
  send_email: "message · send an email (checks do-not-contact, holds and the weekly follow-up cap)",
  // calendar
  list_events: "quiet · calendar between two times",
  find_free_slots: "quiet · open times for a meeting of a given length",
  create_event: "message · add an event and invite people",
  // contacts and CRM
  find_contacts: "quiet · search contacts (built-in, HubSpot, or the lead sheet)",
  read_sheet: "quiet · read a Google Sheet (the connected one, or a link the owner gives) as rows",
  save_contact: "quiet · add or update a contact (stage, tags, notes)",
  list_stale_leads: "quiet · leads with no touch in N days",
  log_touch: "quiet · record that a contact was reached (counts toward the weekly cap)",
  // accounting (QuickBooks, Xero, FreshBooks or Stripe, whichever is connected)
  list_invoices: "quiet · invoices by status (open, overdue, paid), with days overdue",
  get_invoice: "quiet · one invoice with its lines and payments",
  list_payments: "quiet · payments received since a date",
  send_invoice_reminder: "message · have the accounting system email the invoice again with its pay link",
  create_invoice: "money · create and send an invoice",
  create_credit_note: "money · issue a credit note against an invoice",
  // store (Shopify)
  list_orders: "quiet · recent orders (filter by paid, unpaid, unfulfilled)",
  list_unpaid_orders: "quiet · open orders not yet paid",
  list_low_stock: "quiet · products below a stock level",
  // web
  web_search: "quiet · search the web",
  read_page: "quiet · read one web page",
  check_page: "quiet · has this page changed since the bot last looked (for watching competitors, listings, rules)",
} as const;

export type ToolName = keyof typeof TOOL_NAMES;
export const MONEY_TOOLS: ToolName[] = ["create_invoice", "create_credit_note"];
