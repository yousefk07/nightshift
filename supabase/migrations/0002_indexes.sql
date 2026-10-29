-- Indexes for the queries the tick, the live stream and the screens actually make. Safe to run more than once.

-- the tick: bots whose shift is due, runs waiting for a retry, and the reaper's stuck runs and cards
create index if not exists bots_due on bots (next_run_at) where enabled and next_run_at is not null;
create index if not exists runs_retry on runs (retry_at) where retry_at is not null;
create index if not exists runs_running on runs (started_at) where status = 'running';
create index if not exists actions_executing on actions (send_after) where status = 'executing';

-- screens and the admin view: a workspace's latest runs
create index if not exists runs_ws on runs (workspace_id, created_at desc);

-- the live stream: cards decided since the last poll
create index if not exists actions_decided on actions (workspace_id, decided_at) where decided_at is not null;

-- members can read their workspace row (RLS still limits it to their own), but not its Stripe ids or internal
-- counters: the table-wide grant goes, and a grant on every other column replaces it. The app's server uses the
-- service role, so it still sees everything.
revoke select on workspaces from anon, authenticated;
grant select (id, name, about, industry, team_size, pain_points, timezone, shift_start, region, onboarding_step, onboarded_at,
  guardrails, brief_prefs, daily_budget_usd, plan, plan_interval, trial_ends_at, extra_seats, current_period_end,
  billing_email, deleted_at, created_at) on workspaces to authenticated;
