-- ============================================================================
-- Weekly income/expense report email — adds a `weekly_report` toggle to
-- each profile's notification_prefs (default on, matching the existing
-- prefs' opt-out convention). Delivery itself is a Vercel Cron hitting
-- /api/cron/weekly-report — see docs/DEPLOYMENT.md.
-- ============================================================================

-- New profiles get the extra key from the start.
alter table public.profiles alter column notification_prefs set default
  '{"cc_due":true,"cc_overdue":true,"bills":true,"loans":true,"budget":true,"savings":true,"browser":false,"weekly_report":true}'::jsonb;

-- Existing profiles: merge the new key in without touching anything they
-- already set (jsonb || only overwrites keys present on the right side).
update public.profiles
  set notification_prefs = notification_prefs || '{"weekly_report": true}'::jsonb
  where not (notification_prefs ? 'weekly_report');
