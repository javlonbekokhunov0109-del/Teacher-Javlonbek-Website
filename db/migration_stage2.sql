-- =====================================================================
--  teacherjavlonbek.uz — STAGE 2 (run ONCE in Supabase -> SQL Editor; safe to re-run)
--  Run this AFTER db/migration_mocks.sql (already done).
-- =====================================================================
begin;

-- 1) Score dials: IELTS may now go from -0.5 to +1, and Multilevel has its own dial (points of the 17-point writing score)
alter table public.mock_settings drop constraint if exists mock_settings_calibration_offset_check;
alter table public.mock_settings add  constraint mock_settings_calibration_offset_check check (calibration_offset between -0.5 and 1);
alter table public.mock_settings add column if not exists ml_offset numeric(3,1) not null default 0;
alter table public.mock_settings drop constraint if exists mock_settings_ml_offset_check;
alter table public.mock_settings add  constraint mock_settings_ml_offset_check check (ml_offset between -2 and 2);

-- 2) Multilevel scores can now have half points (for example 10.5 of 17). This keeps every existing score as it is.
alter table public.multilevel_submissions alter column raw_score type numeric(4,1) using raw_score::numeric;

-- 3) FULL MOCK IN ONE SITTING: one row per attempt (progress of every section, then the final report)
create table if not exists public.mock_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  mock_id     uuid not null references public.mocks(id) on delete cascade,
  status      text not null default 'in_progress' check (status in ('in_progress','done','abandoned')),
  state       jsonb not null default '{}'::jsonb,
  final       jsonb,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  updated_at  timestamptz not null default now()
);
create index if not exists mock_attempts_user_idx on public.mock_attempts (user_id, started_at desc);
create index if not exists mock_attempts_mock_idx on public.mock_attempts (mock_id);
alter table public.mock_results add column if not exists attempt_id uuid references public.mock_attempts(id) on delete set null;
create index if not exists mock_results_attempt_idx on public.mock_results (attempt_id);
alter table public.mock_attempts enable row level security;
revoke all on public.mock_attempts from anon, authenticated;

commit;
