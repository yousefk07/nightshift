-- `nightshift login`: remember where each request came from, so the approval page can show it and new codes
-- can be rate-limited per network. Safe to run more than once.
alter table device_codes add column if not exists requester_ip text;
alter table device_codes add column if not exists requester_agent text;
alter table device_codes add column if not exists created_at timestamptz not null default now();
create index if not exists device_codes_ip on device_codes (requester_ip, created_at);
