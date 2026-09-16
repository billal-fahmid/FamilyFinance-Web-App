-- ============================================================================
-- Configurable report interval — lets each user pick how often they get the
-- income/expense report email (minutes/hours/days/months), instead of a
-- fixed weekly Monday send. Builds on 0006_weekly_report.sql.
-- ============================================================================

-- When this profile last actually received a report email — drives the
-- "is this person due for one yet" check in /api/cron/weekly-report.
alter table public.profiles add column if not exists weekly_report_last_sent_at timestamptz;

-- New profiles: weekly_report stays the master on/off switch; report_interval
-- is the {unit, value} the cron route reads to compute each person's cadence.
alter table public.profiles alter column notification_prefs set default
  '{"cc_due":true,"cc_overdue":true,"bills":true,"loans":true,"budget":true,"savings":true,"browser":false,
    "weekly_report":true,"report_interval":{"unit":"days","value":7}}'::jsonb;

-- Existing profiles: merge in report_interval without touching anything else,
-- defaulting to the same weekly cadence the feature already shipped with.
update public.profiles
  set notification_prefs = notification_prefs || '{"report_interval":{"unit":"days","value":7}}'::jsonb
  where not (notification_prefs ? 'report_interval');
