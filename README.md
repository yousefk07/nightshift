# Nightshift

A night shift for your small business: a team of AI bots, each a persona at a desk in a pixel office, that work
while you're off and leave their drafts for you to approve over coffee. DeepSeek only. A web app and a CLI on the
same account.

## The team

- **Core five** (any business): Penny (Inbox), Sage (Research), Ledger (Invoices), Nudge (Leads), Dawn (Morning brief).
- **About 420 specialists** across 101 niche industries (orthodontics, immigration law, HVAC, bakeries, Shopify stores,
  wedding planners, trucking ...), each with its own name, job, tools and schedule. Onboarding suggests a team from the
  industry and "what eats your evenings"; `GET /api/catalog` lists the rest. Templates live in `lib/bots/`.
- **Approvals.** Anything that moves money (credit notes, invoices) always waits for the owner. Emails, reminders and
  invites follow each bot's "ask me / just do it" switch. Approving starts an 8-second undo window.
- **Guardrails** on every outreach: the do-not-contact list, holds ("reminders paused for Acme"), and at most one
  follow-up per contact per week across all bots.
- **Shared memory** every bot reads, documents they write, flags, and a morning brief drafted an hour early and
  delivered at the owner's time.

## How it fits together

- `lib/engine/agent.ts`: runs one bot on one task (DeepSeek V4.1 Flash with tools; Pro writes research reports),
  enforcing approvals, guards and the daily budget, and keeping the office status up to date.
- `lib/engine/flows.ts`: chat, the bot room (`@Penny ...`), approvals (undo, batch, "Ask Ledger"), hiring, the office
  and desk views, and the 5-minute tick. `lib/maintenance.ts`: briefs, CRM sync, broken-connection alerts, purging.
- `lib/tools/`: every tool, marked quiet, message or money. `lib/connectors/`: Gmail + Calendar, Outlook + Microsoft 365,
  QuickBooks, Xero, FreshBooks, Stripe, Shopify, HubSpot, Google Sheets / CSV, Tavily.
- `lib/notify.ts`: alerts by app, email (Resend) and web push, with quiet hours. `lib/billing.ts` + `lib/plans.ts`:
  Solo $39 / Studio $89 / Team $189 on Stripe Billing, 14-day Studio trial, seats, plan limits.
- `lib/auth.ts` + `lib/team.ts`: Supabase sign-in, roles (owner, approver, approver: email only, viewer), invites,
  CLI device login, read-only tokens.
- `supabase/migrations/0001_init.sql`: the schema. `supabase/cron.sql`: the 5-minute timer.
- `cli/nightshift.mjs`: the CLI, no dependencies.

## API (all JSON; streams are NDJSON or server-sent events)

| Screen | Endpoints |
|---|---|
| Office | `GET /api/office`, `GET /api/stream` (live), `GET/PATCH/DELETE /api/bots/:kind`, `POST /api/bots/:kind/run` |
| Your desk / Approvals | `GET /api/desk`, `GET /api/actions`, `POST /api/actions/:id` (approve, discard, revise), `POST /api/actions/:id/undo`, `POST /api/actions/batch` |
| Chats | `POST /api/chat` (streamed), `GET /api/threads?bot=`, `GET /api/threads/:id` |
| Bot room | `GET/POST /api/room`, `GET/POST /api/holds`, `DELETE /api/holds/:id` |
| Brief | `GET /api/brief`, `GET/PUT /api/notifications/prefs` |
| Onboarding | `PATCH/POST /api/onboarding`, `GET /api/catalog`, `POST /api/bots` |
| Connections | `GET /api/connections`, `GET /api/connect/:oauthProvider`, `POST /api/connect/:keyProvider`, `DELETE /api/connections/:id`, `POST /api/contacts/import` |
| Settings | `GET/PATCH /api/profile`, `GET/POST/DELETE /api/team`, `PATCH/DELETE /api/team/:userId`, `GET/PUT /api/do-not-contact`, `GET/POST/DELETE /api/memory`, `GET /api/documents`, `GET /api/activity`, `GET /api/export`, `PATCH/DELETE/POST /api/workspace` |
| Billing | `GET /api/billing`, `POST /api/billing/checkout`, `POST /api/billing/portal`, `POST /api/billing/webhook` |
| CLI & API | `POST /api/device/code`, `POST /api/device/approve`, `POST /api/device/token`, `GET/POST/DELETE /api/tokens` |
| Alerts | `GET/POST /api/notifications`, `GET/POST/DELETE /api/push` |

## Setup

1. In Supabase, run `supabase/migrations/0001_init.sql` in the SQL editor. Turn on email sign-in (and Google /
   Microsoft if wanted). Set the sign-in email to send through Resend (SMTP) for a branded link.
2. Copy `.env.example` to `.env.local` and fill it in. `npm install`, `npm run dev`.
3. Deploy to Vercel with the same variables, then run `supabase/cron.sql` with your URL and `CRON_SECRET`.
4. In Stripe, add a webhook to `APP_URL/api/billing/webhook` for `customer.subscription.*` and set `STRIPE_WEBHOOK_SECRET`.

## CLI

```
npm link                       # or: node cli/nightshift.mjs
nightshift login               # approves this device in your browser
nightshift status
nightshift queue
nightshift approve 1 2
nightshift ask sage "best kiln shelf supplier under $400?"
nightshift room
```

## Tests

`npm test`: the engine end to end against an in-memory store and a fake DeepSeek (approvals, undo, money always
asking, roles, revisions, holds, do-not-contact, the weekly cap, memory, the Pro write-up, hand-offs, schedules,
trial expiry, the office and desk views), every catalog template validated, and the connectors' parsing (accounting,
CSV, calendar, webhooks, quiet hours).
