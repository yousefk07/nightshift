-- Nightshift schema, v1. One workspace per business; v1 has a single owner, but every row is scoped to a
-- workspace so teams and billing can be added without reshaping the data.
create extension if not exists pgcrypto;

create type bot_kind as enum ('inbox', 'research', 'followup', 'brief');
create type approval_mode as enum ('ask', 'auto');                  -- per bot: ask before outward actions, or just do it
create type run_status as enum ('queued', 'running', 'done', 'failed', 'stopped');
create type run_trigger as enum ('schedule', 'chat', 'room', 'manual', 'handoff');
create type action_status as enum ('pending', 'approved', 'rejected', 'done', 'failed');
create type thread_kind as enum ('direct', 'room');
create type message_role as enum ('owner', 'bot', 'system');
create type provider as enum ('google', 'microsoft', 'stripe', 'shopify');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My business',
  timezone text not null default 'America/Toronto',
  about text not null default '',                                  -- what the business does, given to every bot
  daily_budget_usd numeric(8, 2) not null default 2.00,             -- hidden cap on model + search spend per day
  created_at timestamptz not null default now()
);

create table members (
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table bots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  kind bot_kind not null,
  name text not null,
  approval approval_mode not null default 'ask',
  enabled boolean not null default true,
  settings jsonb not null default '{}',                             -- per-bot options (VIP senders, follow-up days ...)
  state jsonb not null default '{}',                                -- the bot's own bookmarks (emails already seen ...)
  next_run_at timestamptz,                                          -- null = only runs when asked
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, kind)
);

create table connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  provider provider not null,
  account text not null,                                            -- the mailbox address or shop domain
  secret_enc text not null,                                         -- AES-GCM encrypted JSON (tokens / keys)
  scopes text[] not null default '{}',
  status text not null default 'ok' check (status in ('ok', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, account)
);

-- A direct thread is a 1:1 chat with one bot; the room is the one group chat where bots hand work to each other.
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
  input text not null default '',                                   -- the task, for queued and handed-off runs
  model text,
  steps int not null default 0,
  tokens_hit int not null default 0,
  tokens_miss int not null default 0,
  tokens_out int not null default 0,
  searches int not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  summary text,
  error text,
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
  bot_id uuid references bots on delete set null,                   -- who spoke, for bot messages
  run_id uuid references runs on delete set null,
  content text not null,
  data jsonb not null default '{}',                                 -- cards: action ids, report, flags
  created_at timestamptz not null default now(),
  check ((role = 'bot') = (bot_id is not null))
);
create index messages_thread on messages (thread_id, created_at);

-- Anything a bot wants to do outside Nightshift (send, pay, post) when its approval is 'ask'.
create table actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  bot_id uuid not null references bots on delete cascade,
  run_id uuid references runs on delete set null,
  tool text not null,                                               -- the tool to run once approved
  title text not null,
  payload jsonb not null,                                           -- the tool's arguments, editable before approving
  status action_status not null default 'pending',
  result jsonb,
  error text,
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index actions_pending on actions (workspace_id, created_at desc) where status = 'pending';

create table flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  bot_id uuid not null references bots on delete cascade,
  source text not null,                                             -- 'email', 'stripe', 'shopify' ...
  external_id text not null,
  title text not null,
  why text not null,
  importance smallint not null default 2 check (importance between 1 and 3), -- 3 = needs you today
  url text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, source, external_id)
);
create index flags_open on flags (workspace_id, created_at desc) where resolved_at is null;

create table briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  for_date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, for_date)
);

create table usage_days (
  workspace_id uuid not null references workspaces on delete cascade,
  day date not null,
  cost_usd numeric(10, 6) not null default 0,
  searches int not null default 0,
  primary key (workspace_id, day)
);

-- Personal tokens for the CLI. Only a hash is stored; the token is shown once.
create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'CLI',
  token_hash text not null unique,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Adds spend to today's total atomically (bots can run at the same time).
create function add_usage(p_workspace uuid, p_day date, p_cost numeric, p_searches int)
returns numeric language sql as $$
  insert into usage_days (workspace_id, day, cost_usd, searches) values (p_workspace, p_day, p_cost, p_searches)
  on conflict (workspace_id, day) do update
    set cost_usd = usage_days.cost_usd + excluded.cost_usd, searches = usage_days.searches + excluded.searches
  returning cost_usd;
$$;

-- Hands queued runs to exactly one tick, even when two overlap.
create function claim_queued_runs(lim int) returns setof runs language sql as $$
  update runs set status = 'running', started_at = now()
  where id in (select id from runs where status = 'queued' order by created_at limit lim for update skip locked)
  returning *;
$$;

-- Row-level security: members see their own workspace. The server uses the service key and scopes every query
-- itself; these policies keep the browser's anon key from reading anything else.
do $$
declare t text;
begin
  foreach t in array array['workspaces', 'bots', 'connections', 'threads', 'runs', 'messages', 'actions', 'flags', 'briefs', 'usage_days'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
alter table members enable row level security;
alter table api_tokens enable row level security;

create function is_member(ws uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid());
$$;

create policy members_self on members for select using (user_id = auth.uid());
create policy workspaces_member on workspaces for select using (is_member(id));
create policy bots_member on bots for select using (is_member(workspace_id));
create policy threads_member on threads for select using (is_member(workspace_id));
create policy runs_member on runs for select using (is_member(workspace_id));
create policy messages_member on messages for select using (is_member(workspace_id));
create policy actions_member on actions for select using (is_member(workspace_id));
create policy flags_member on flags for select using (is_member(workspace_id));
create policy briefs_member on briefs for select using (is_member(workspace_id));
create policy usage_member on usage_days for select using (is_member(workspace_id));
-- connections and api_tokens hold secrets: no browser access at all.
