-- Businesses that asked for a free trial: from the link in an outreach email (signed, one per business) or the
-- form on /trial. One row per email; clicking again bumps the count. Only the server reads or writes it.
-- Safe to run more than once.
create table if not exists trial_interest (
  id bigint generated always as identity primary key,
  email text not null,
  business text not null default '',
  contact_name text,
  phone text,
  niche text,
  city text,
  source text not null default 'form',       -- 'outreach' (the emailed link), 'form' or 'signin' (signed in, not approved)
  ip text,
  clicks int not null default 1,
  status text not null default 'new',        -- new, approved (may start a trial), started, not_now
  created_at timestamptz not null default now(),
  last_click_at timestamptz not null default now()
);
create unique index if not exists trial_interest_email on trial_interest (lower(email));
create index if not exists trial_interest_recent on trial_interest (created_at desc);
alter table trial_interest drop constraint if exists trial_interest_status_check;
alter table trial_interest add constraint trial_interest_status_check check (status in ('new', 'contacted', 'approved', 'started', 'not_now'));
alter table trial_interest enable row level security; -- no policies: nobody but the server
