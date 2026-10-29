# Nightshift

A team of AI bots that run parts of a small business, on DeepSeek only. A web app and a CLI on the same account.

v1 team: **Inbox** (flags what matters, drafts replies), **Research** (web research with sources), **Follow-up** (unanswered emails, unpaid Stripe invoices and Shopify orders) and **Morning brief** (one page each morning). Each bot has an *ask me / just do it* switch: on *ask*, anything that sends, pays or posts becomes an approval card instead of running.

The UI (an office with the bots at their desks, 1:1 chat, and a bot room where they hand work to each other) is being designed separately; `app/page.tsx` is a setup page until then.

## How it fits together

- `lib/engine/agent.ts`: runs one bot on one task. DeepSeek V4.1 Flash with tool calls, until it answers. Outward tools on an *ask* bot become `actions`. The daily budget is checked before every step.
- `lib/bots/index.ts`: the four bots (role, tools, schedule, scheduled task). Research gathers with Flash, then V4 Pro writes the report.
- `lib/tools/index.ts`: every tool, marked `quiet` (read, flag, label, draft) or `outward` (send, remind, invite).
- `lib/connectors/`: Gmail + Google Calendar, Outlook + Microsoft 365 (Graph), Stripe, Shopify, Tavily search.
- `lib/engine/flows.ts`: chat, the bot room (`@inbox ...` gives a bot a job), approvals, run-now, and the 5-minute tick.
- `lib/store.ts`: the storage interface. `store-supabase.ts` in production, `test/memstore.ts` in tests.
- `supabase/migrations/0001_init.sql`: the schema. `supabase/cron.sql`: the 5-minute timer.
- `cli/nightshift.mjs`: the CLI, with no dependencies.

## Setup

1. Make a Supabase project and run `supabase/migrations/0001_init.sql` in its SQL editor. Turn on email sign-in.
2. Copy `.env.example` to `.env.local` and fill it in (DeepSeek key, Supabase keys, `ALLOWED_EMAILS`, `ENCRYPTION_KEY`, `CRON_SECRET`).
3. `npm install`, then `npm run dev`. Sign in at http://localhost:3000 with an allowed email. Your workspace and its four bots are made the first time you sign in.
4. Deploy to Vercel with the same variables, then run `supabase/cron.sql` (with your URL and `CRON_SECRET`) so the bots run on their own.
5. Connections: Google and Microsoft need an OAuth app each (redirect `APP_URL/api/connect/<google|microsoft>/callback`). Stripe takes a restricted key and Shopify an Admin API token (`nightshift connect stripe rk_live_...`).

## CLI

```
npm link                      # or: node cli/nightshift.mjs
nightshift login https://your-app.vercel.app ns_...
nightshift chat inbox "anything from Acme this week?"
nightshift room --watch
nightshift approvals
nightshift approve 3f2a91c0
```

## Tests

`npm test` runs the engine end to end against an in-memory store and a fake DeepSeek, with no network: approvals, edits and rejections, auto mode, connector-gated tools, budget stops, cost accounting, hand-offs through the tick, room mentions, the Pro write-up, schedules across the clock change, the stream parser, encryption and mail encoding.
