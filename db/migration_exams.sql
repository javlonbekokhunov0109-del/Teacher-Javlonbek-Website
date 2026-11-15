-- =====================================================================
--  teacherjavlonbek.uz — Real Exam Tests (Reading passages + full Listening tests)
--  Run ONCE in Supabase -> SQL Editor. Safe to run again. Touches no existing data.
--   * exam_tests     one row per uploaded test (a Reading passage / a full Reading test / a full Listening test)
--   * exam_settings  which classes (e.g. IELTS WARRIORS) may open the tests that are not free
--   * exam_results   every finished attempt (score) -> the student sees theirs, the teacher sees all
--  The test files themselves live in the existing private "lesson-content" storage, folder exams/.
-- =====================================================================
begin;

create table if not exists public.exam_tests (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('reading','listening')),
  series      text not null default '',          -- e.g. "IELTS WARRIORS", "Volume 10"
  test_no     int  not null default 1,           -- Test 1, Test 2 ...
  passage_no  int,                               -- 1, 2, 3 for a single Reading passage; empty for a whole test
  title       text not null,                     -- the name students see, e.g. "The Formation of Continents"
  minutes     int  not null default 60,
  questions   int  not null default 40,
  html_path   text,
  audio_path  text,
  is_free     boolean not null default false,    -- free sample for every signed-in student
  ready       boolean not null default false,    -- true once the upload finished
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists exam_tests_kind_idx on public.exam_tests(kind, series, test_no, passage_no);

create table if not exists public.exam_settings (
  id        int primary key default 1 check (id = 1),
  class_ids uuid[] not null default '{}'
);
insert into public.exam_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.exam_results (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  test_id    uuid not null references public.exam_tests(id) on delete cascade,
  score      int  not null,
  total      int  not null,
  band       numeric(3,1),
  q          jsonb,                              -- per-question right(1)/wrong(0), when the test reports it
  created_at timestamptz not null default now()
);
create index if not exists exam_results_user_idx on public.exam_results(user_id, test_id, created_at desc);
create index if not exists exam_results_test_idx on public.exam_results(test_id, created_at desc);

-- Same rule as the other service-only tables: the browser never reads these directly; the server functions do.
alter table public.exam_tests    enable row level security;
alter table public.exam_settings enable row level security;
alter table public.exam_results  enable row level security;
revoke all on public.exam_tests, public.exam_settings, public.exam_results from anon, authenticated;
grant  all on public.exam_tests, public.exam_settings, public.exam_results to service_role;

commit;
