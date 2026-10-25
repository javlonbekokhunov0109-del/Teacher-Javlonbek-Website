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

commit;
