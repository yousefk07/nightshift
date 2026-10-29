-- Nightshift schema. One workspace per business; people join it as members with a role. Every row is scoped to
-- a workspace. Bot templates live in code (lib/bots); `bots` holds the ones a workspace hired.
create extension if not exists pgcrypto;

create type approval_mode as enum ('ask', 'auto');                  -- per bot, for messages; money always asks
create type bot_status as enum ('idle', 'working', 'needs_you', 'blocked', 'failed', 'paused');
create type run_status as enum ('queued', 'running', 'done', 'partial', 'failed', 'stopped');
create type run_trigger as enum ('schedule', 'chat', 'room', 'manual', 'handoff', 'retry', 'revise');
create type action_status as enum ('pending', 'sending', 'executing', 'done', 'rejected', 'undone', 'failed', 'revising');
create type action_risk as enum ('message', 'money');
create type thread_kind as enum ('direct', 'room');
create type message_role as enum ('owner', 'bot', 'system');
create type message_kind as enum ('text', 'handoff', 'hold', 'approval', 'event');
create type member_role as enum ('owner', 'approver', 'approver_email', 'viewer');
create type provider as enum ('google', 'microsoft', 'stripe', 'quickbooks', 'xero', 'freshbooks', 'shopify', 'hubspot', 'sheets');
create type connection_kind as enum ('email', 'calendar', 'accounting', 'crm', 'store');
create type plan as enum ('trial', 'solo', 'studio', 'team', 'canceled');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My business',
  about text not null default '',                                   -- "What do you do, in a sentence?"
  industry text not null default 'general',                         -- an INDUSTRIES key (lib/bots/template.ts)
  team_size text,                                                   -- "2–5 people"
  pain_points text[] not null default '{}',                         -- "What eats your evenings?"
  timezone text not null default 'America/Toronto',
  shift_start time not null default '19:00',                        -- "Your team clocks in at 7 PM"
  region text not null default 'us' check (region in ('us', 'eu')),
  onboarding_step smallint not null default 1,
  onboarded_at timestamptz,
  guardrails jsonb not null default '{"pause_on_dispute": true, "weekly_cap": true}',
  brief_prefs jsonb not null default '{"time": "06:30", "days": [1,2,3,4,5,6], "length": "short", "channels": ["app", "email"]}',
  daily_budget_usd numeric(8, 2) not null default 3.00,             -- hidden cap on model + search spend per day
  counters jsonb not null default '{}',                             -- next credit note number etc.
  -- billing
  plan plan not null default 'trial',
  plan_interval text check (plan_interval in ('month', 'year')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  extra_seats int not null default 0,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  billing_email text,
  deleted_at timestamptz,                                           -- "Delete workspace": purged 30 days later
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  avatar_url text,
  phone text,                                                       -- for text-message alerts, E.164
  working_hours jsonb not null default '{"start": "09:00", "end": "18:00", "days": [1,2,3,4,5,6]}',
  signature text not null default '',                               -- "Email signature and tone"
  updated_at timestamptz not null default now()
);

create table members (
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role member_role not null default 'owner',
  notify jsonb not null default '{}',                               -- event -> channels, quiet hours (lib/notify.ts)
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index members_user on members (user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  email text not null,
  role member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid references auth.users on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invites_open on invites (workspace_id, lower(email)) where accepted_at is null;

create table bots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  kind text not null,                                               -- template id: 'inbox', 'dental_general.recall'
  name text not null,
  approval approval_mode not null default 'ask',
  enabled boolean not null default true,                            -- false = paused by the owner
  status bot_status not null default 'idle',
  status_text text not null default '',                             -- "Comparing clay suppliers"
  blocked_reason text,
  settings jsonb not null default '{}',
  state jsonb not null default '{}',                                -- the bot's own bookmarks
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, kind)
);

create table connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  provider provider not null,
  kinds connection_kind[] not null,                                 -- google = {email, calendar}
  account text not null,                                            -- mailbox, company or shop
  secret_enc text not null,                                         -- AES-GCM encrypted JSON (tokens / keys)
  scopes text[] not null default '{}',
  status text not null default 'ok' check (status in ('ok', 'needs_signin', 'error')),
  error text,
  broken_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, account)
);

create table threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  kind thread_kind not null,
  bot_id uuid references bots on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'room') = (bot_id is null))
);
create unique index threads_one_room on threads (workspace_id) where kind = 'room';
create index threads_bot on threads (bot_id, updated_at desc);

create table runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  bot_id uuid not null references bots on delete cascade,
  thread_id uuid references threads on delete set null,
  trigger run_trigger not null,
  status run_status not null default 'running',
  input text not null default '',
  model text,
  steps int not null default 0,
  tokens_hit int not null default 0,
  tokens_miss int not null default 0,
  tokens_out int not null default 0,
  searches int not null default 0,
  seconds int not null default 0,                                   -- wall time, for research-hour metering
  cost_usd numeric(10, 6) not null default 0,
  summary text,
  error text,
  retry_at timestamptz,                                             -- "Retry at 4 AM"
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index runs_bot on runs (bot_id, created_at desc);
create index runs_queued on runs (workspace_id, created_at) where status = 'queued';

create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  thread_id uuid not null references threads on delete cascade,
  role message_role not null,
  kind message_kind not null default 'text',
  bot_id uuid references bots on delete set null,
  user_id uuid references auth.users on delete set null,
  run_id uuid references runs on delete set null,
  content text not null,
  data jsonb not null default '{}',                                 -- handoff {to_bot, title}, approval {action_ids} ...
  mentions uuid[] not null default '{}',                            -- bots @mentioned
  created_at timestamptz not null default now()
);
create index messages_thread on messages (thread_id, created_at);
create index messages_ws on messages (workspace_id, created_at);

-- Approval cards: anything that would send or move money.
create table actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  bot_id uuid not null references bots on delete cascade,
  run_id uuid references runs on delete set null,
  thread_id uuid references threads on delete set null,             -- the chat it came from, for the "Sent" line
  tool text not null,
  risk action_risk not null,
  title text not null,
  counterparty text,                                                -- "Acme Hotels", "Lena Ortiz"
  amount_cents bigint,
  currency text,
  payload jsonb not null,                                           -- the tool's arguments, editable before approving
  group_key text,                                                   -- cards that belong together ("Approve both")
  status action_status not null default 'pending',
  send_after timestamptz,                                           -- approved, sends at this time unless undone
  result jsonb,
  error text,
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index actions_pending on actions (workspace_id, created_at) where status = 'pending';
create index actions_sending on actions (send_after) where status = 'sending';

create table flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  bot_id uuid not null references bots on delete cascade,
  kind text not null default 'info',                                -- dispute, complaint, time_sensitive, lead_reply, connection, info
  source text not null,
  external_id text not null,
  title text not null,
  why text not null,
  importance smallint not null default 2 check (importance between 1 and 3),
  url text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, source, external_id)
);
create index flags_open on flags (workspace_id, created_at desc) where resolved_at is null;

-- "Holds in place": the team stops contacting someone (reminders paused for Acme) until released or resume_at.
create table holds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  subject text not null,                                            -- an email, a domain or a company name, lower case
  label text not null,                                              -- "Acme"
  scope text not null default 'all' check (scope in ('all', 'reminders', 'followups')),
  reason text not null,
  bot_id uuid references bots on delete set null,                   -- who placed it
  user_id uuid references auth.users on delete set null,
  resume_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create index holds_open on holds (workspace_id) where released_at is null;

create table contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text not null default '',
  email text,
  phone text,
  company text,
  stage text not null default 'lead',                               -- lead, quoted, customer, lost ...
  tags text[] not null default '{}',
  notes text not null default '',
  source text not null default 'nightshift',                        -- nightshift, csv, hubspot, sheets
  external_id text,
  last_touch_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_email on contacts (workspace_id, lower(email)) where email is not null;
create index contacts_stale on contacts (workspace_id, last_touch_at);

-- "Never contact these people": emails and whole domains.
create table do_not_contact (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  kind text not null check (kind in ('email', 'domain')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, kind, value)
);

-- Every outreach, for "at most one follow-up per contact per week" (shared by every bot).
create table touches (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces on delete cascade,
  email text not null,
  bot_id uuid references bots on delete set null,
  channel text not null default 'email',
  at timestamptz not null default now()
);
create index touches_recent on touches (workspace_id, email, at desc);

-- Shared team memory: facts any bot can recall ("Acme pays on the 15th", "sign off as Sam").
create table memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  subject text not null default '',                                 -- who or what it's about
  fact text not null,
  bot_id uuid references bots on delete set null,
  user_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index memories_ws on memories (workspace_id, created_at desc);

-- Deliverables: reports, quotes, proposals, posts, SOPs.
create table documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  bot_id uuid references bots on delete set null,
  run_id uuid references runs on delete set null,
  kind text not null default 'report',
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index documents_ws on documents (workspace_id, created_at desc);

create table briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  for_date date not null,
  status text not null default 'draft' check (status in ('draft', 'final')),
  headline text not null default '',
  content text not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, for_date)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  event text not null,
  title text not null,
  body text not null default '',
  url text,
  channels text[] not null default '{}',                            -- where it actually went
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);

-- Phones and laptops that get web push alerts (the free stand-in for text messages).
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  device text not null default '',
  created_at timestamptz not null default now()
);

-- Who did what, and why. Kept 30 days / 1 year / forever by plan.
create table activity (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces on delete cascade,
  actor_type text not null check (actor_type in ('user', 'bot', 'system')),
  actor_id uuid,
  action text not null,                                             -- 'approved', 'sent_email', 'placed_hold' ...
  target text not null default '',
  why text not null default '',
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index activity_ws on activity (workspace_id, at desc);

create table usage_days (
  workspace_id uuid not null references workspaces on delete cascade,
  day date not null,
  cost_usd numeric(10, 6) not null default 0,
  searches int not null default 0,
  research_seconds int not null default 0,
  primary key (workspace_id, day)
);

create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'CLI',                                 -- "CLI · Sam's MacBook"
  scope text not null default 'full' check (scope in ('full', 'read')),
  token_hash text not null unique,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- `nightshift login`: the CLI shows a code, the owner approves it in the browser, the CLI collects its token.
create table device_codes (
  device_code_hash text primary key,
  user_code text not null unique,
  device_name text not null default 'CLI',
  workspace_id uuid references workspaces on delete cascade,
  user_id uuid references auth.users on delete cascade,
  token_enc text,                                                   -- set on approval, handed over once
  approved_at timestamptz,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- Adds spend to today's total atomically (bots run at the same time).
create function add_usage(p_workspace uuid, p_day date, p_cost numeric, p_searches int, p_seconds int)
returns numeric language sql as $$
  insert into usage_days (workspace_id, day, cost_usd, searches, research_seconds) values (p_workspace, p_day, p_cost, p_searches, p_seconds)
  on conflict (workspace_id, day) do update
    set cost_usd = usage_days.cost_usd + excluded.cost_usd,
        searches = usage_days.searches + excluded.searches,
        research_seconds = usage_days.research_seconds + excluded.research_seconds
  returning cost_usd;
$$;

-- Hands queued runs to exactly one tick, even when two overlap.
create function claim_queued_runs(lim int) returns setof runs language sql as $$
  update runs set status = 'running', started_at = now()
  where id in (select id from runs where status = 'queued' order by created_at limit lim for update skip locked)
  returning *;
$$;

-- Takes approved actions whose undo window has passed, once.
create function claim_due_actions(lim int) returns setof actions language sql as $$
  update actions set status = 'executing'
  where id in (select id from actions where status = 'sending' and send_after <= now() order by send_after limit lim for update skip locked)
  returning *;
$$;

-- The next number in a workspace counter (credit notes: CN-0107).
create function next_counter(p_workspace uuid, p_key text) returns int language sql as $$
  update workspaces set counters = jsonb_set(counters, array[p_key], to_jsonb(coalesce((counters ->> p_key)::int, 0) + 1))
  where id = p_workspace
  returning (counters ->> p_key)::int;
$$;

-- Row-level security: members read their own workspace through the browser's anon key. The server uses the
-- service key and scopes every query itself.
create function is_member(ws uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['workspaces', 'profiles', 'members', 'invites', 'bots', 'connections', 'threads', 'runs', 'messages', 'actions',
    'flags', 'holds', 'contacts', 'do_not_contact', 'touches', 'memories', 'documents', 'briefs', 'notifications', 'activity', 'usage_days',
    'api_tokens', 'device_codes', 'push_subscriptions'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach t in array array['bots', 'threads', 'runs', 'messages', 'actions', 'flags', 'holds', 'contacts', 'memories', 'documents', 'briefs', 'usage_days'] loop
    execute format('create policy %I on %I for select using (is_member(workspace_id))', t || '_member', t);
  end loop;
end $$;
create policy workspaces_member on workspaces for select using (is_member(id));
create policy members_self on members for select using (user_id = auth.uid() or is_member(workspace_id));
create policy profiles_self on profiles for select using (user_id = auth.uid());
create policy notifications_self on notifications for select using (user_id = auth.uid());
-- connections, invites, api_tokens, device_codes, touches, do_not_contact and activity: server only.

-- Live updates for the office, the room and approvals (Supabase Realtime, still filtered by the policies above).
alter publication supabase_realtime add table messages, actions, bots, notifications;
