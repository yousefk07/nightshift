-- Server errors, kept 30 days: shown in the admin view and summed up in a daily email to the people running
-- Nightshift. Only the server (service role) reads or writes it. Safe to run more than once.
create table if not exists error_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null,                     -- the route ("/api/chat") or "tick"
  message text not null,
  workspace_id uuid,                        -- when known; no foreign key, so a deleted workspace keeps its history
  detail jsonb not null default '{}'
);
create index if not exists error_log_at on error_log (at desc);
alter table error_log enable row level security; -- no policies: nobody but the server
