-- Run once in the Supabase SQL editor after the app is deployed. Calls Nightshift's tick every 5 minutes
-- (Vercel's free plan only allows daily timers). Replace the two placeholders first.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'nightshift-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/tick',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- To stop it: select cron.unschedule('nightshift-tick');
