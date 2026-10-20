-- =====================================================================
--  teacherjavlonbek.uz — Mock tests, AI-marking settings, member end dates
--  Run ONCE in Supabase -> SQL Editor. Safe to re-run. Touches no existing data.
-- =====================================================================
begin;

-- 1) Members can have an end date; a class can include the mock tests
alter table public.class_members add column if not exists valid_until date;
alter table public.classes       add column if not exists includes_mocks boolean not null default false;

-- 2) The mock tests themselves (content lives here, so new mocks need no code deploy)
create table if not exists public.mocks (
  id             uuid primary key default gen_random_uuid(),
  number         int  not null unique,
  title          text not null,
  description    text,
  is_free        boolean not null default false,
  published      boolean not null default false,
  listening_item uuid references public.content_items(id) on delete set null,
  reading_item   uuid references public.content_items(id) on delete set null,
  writing        jsonb not null default '{}'::jsonb,
  speaking       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 3) Every AI check a student runs on a mock (Writing Task 1/2, Speaking)
create table if not exists public.mock_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  mock_id     uuid not null references public.mocks(id) on delete cascade,
  section     text not null check (section in ('writing_t1','writing_t2','speaking')),
  status      text not null default 'done' check (status in ('pending','done','error')),
  band        numeric(2,1),
  payload     jsonb not null default '{}'::jsonb,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists mock_results_user_idx on public.mock_results (user_id, created_at desc);
create index if not exists mock_results_mock_idx on public.mock_results (mock_id);

-- 4) One row of AI-marking settings you can edit from the admin page (no deploy needed)
create table if not exists public.mock_settings (
  id                  int primary key default 1 check (id = 1),
  writing_prompt      text,                                   -- empty = built-in calibrated prompt
  speaking_prompt     text,
  calibration_offset  numeric(3,2) not null default 0 check (calibration_offset between 0 and 0.5),
  show_range          boolean not null default true,
  speaking_enabled    boolean not null default false,
  daily_limit_free    int not null default 6  check (daily_limit_free  between 0 and 200),
  daily_limit_member  int not null default 30 check (daily_limit_member between 0 and 500),
  gemini_model        text,
  updated_at          timestamptz not null default now()
);
insert into public.mock_settings (id) values (1) on conflict (id) do nothing;

-- 5) Private bucket for speaking recordings (deleted right after marking)
insert into storage.buckets (id, name, public) values ('speaking-audio', 'speaking-audio', false)
on conflict (id) do nothing;

-- 6) Lock the new tables: only the site's server functions can touch them
alter table public.mocks         enable row level security;
alter table public.mock_results  enable row level security;
alter table public.mock_settings enable row level security;
revoke all on public.mocks, public.mock_results, public.mock_settings from anon, authenticated;

-- 7) The first 5 mocks (Writing + Speaking). Mock 1 is free and live; 2-5 are drafts waiting for your Listening/Reading
--    files: publish each one in Admin -> Mocks. Re-running this never overwrites mocks you have edited.
insert into public.mocks (number, title, description, is_free, published, writing, speaking) values
  (1, $j$Mock Test 1 (Free)$j$, $j$Free starter mock: full Writing and Speaking set with AI marking.$j$, true, true,
   $j${"task1": {"type": "line", "title": "Households with internet access (%), 2000-2020", "min_words": 150, "question": "The line graph below shows the percentage of households with internet access in three countries between 2000 and 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.", "data": {"x": [2000, 2005, 2010, 2015, 2020], "unit": "%", "ylabel": "Households with internet access (%)", "series": [{"name": "Country A", "values": [12, 28, 55, 78, 91]}, {"name": "Country B", "values": [5, 14, 30, 52, 70]}, {"name": "Country C", "values": [20, 38, 60, 72, 80]}]}}, "task2": {"min_words": 250, "question": "More and more people are choosing to work from home instead of travelling to an office.\n\nDo the advantages of this development outweigh the disadvantages?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience."}}$j$::jsonb,
   $j${"part1": [{"topic": "Your hometown", "questions": ["Where is your hometown, and what is it best known for?", "What do you like most about living there?", "Has your hometown changed much since you were a child?", "Would you like to live there in the future? Why, or why not?"]}, {"topic": "Free time", "questions": ["What do you usually do in your free time?", "Do you prefer spending your free time alone or with other people?", "Is there a hobby you would like to start in the future?", "Did you enjoy the same activities when you were younger?"]}], "part2": {"title": "Describe a useful skill that you learned when you were a child.", "bullets": ["what the skill is", "who taught it to you", "how you learned it"], "roundoff": "and explain why this skill has been useful to you."}, "part3": ["Why do you think some skills are easier to learn when people are young?", "Do you think schools should teach more practical skills? Which ones?", "How has the way people learn new skills changed in recent years?", "Some people say that experience is more valuable than formal education. What is your opinion?", "Which skills will be most important for young people in the future?"]}$j$::jsonb),
  (2, $j$Mock Test 2$j$, $j$Paid mock: bar chart report, a problem-solution essay, and a full Speaking test.$j$, false, false,
   $j${"task1": {"type": "bar", "title": "Average weekly hours teenagers spend on leisure activities, 2005 and 2020", "min_words": 150, "question": "The bar chart below compares the average number of hours teenagers in one country spent on six leisure activities each week in 2005 and in 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.", "data": {"categories": ["Watching TV", "Social media", "Sport", "Reading", "Gaming", "Seeing friends"], "unit": "hours", "ylabel": "Hours per week", "series": [{"name": "2005", "values": [14, 6, 8, 5, 4, 9]}, {"name": "2020", "values": [7, 15, 6, 3, 11, 5]}]}}, "task2": {"min_words": 250, "question": "In many large cities, the cost of housing has risen sharply, making it difficult for young people to buy or rent a home.\n\nWhat are the causes of this problem, and what measures could be taken to solve it?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience."}}$j$::jsonb,
   $j${"part1": [{"topic": "Food and cooking", "questions": ["Do you enjoy cooking? Why, or why not?", "What kind of food do you eat most often at home?", "Is there a traditional dish from your country that you particularly like?", "Do you think people eat more healthily now than in the past?"]}, {"topic": "Transport", "questions": ["How do you usually travel to work or school?", "Is public transport easy to use where you live?", "Have you ever had a problem while travelling?", "What changes would you like to see in transport in your area?"]}], "part2": {"title": "Describe a meal that you remember particularly well.", "bullets": ["when and where you had it", "who you were with", "what you ate"], "roundoff": "and explain why this meal was memorable for you."}, "part3": ["Why do many families find it hard to eat together nowadays?", "Do you think traditional food will disappear as fast food becomes more popular?", "Should governments do more to encourage healthy eating? How?", "How important is food in bringing people from different cultures together?", "What are the advantages and disadvantages of eating out regularly?"]}$j$::jsonb),
  (3, $j$Mock Test 3$j$, $j$Paid mock: pie charts comparison, a two-part question essay, and a full Speaking test.$j$, false, false,
   $j${"task1": {"type": "pie", "title": "Household energy use by source, 1990 and 2020 (%)", "min_words": 150, "question": "The pie charts below show the sources of energy used by households in one country in 1990 and in 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.", "data": {"pies": [{"title": "1990", "slices": [{"label": "Coal", "value": 40}, {"label": "Oil", "value": 30}, {"label": "Gas", "value": 20}, {"label": "Nuclear", "value": 6}, {"label": "Renewables", "value": 4}]}, {"title": "2020", "slices": [{"label": "Coal", "value": 12}, {"label": "Oil", "value": 18}, {"label": "Gas", "value": 34}, {"label": "Nuclear", "value": 11}, {"label": "Renewables", "value": 25}]}]}}, "task2": {"min_words": 250, "question": "Many people today choose to buy goods online rather than in traditional shops.\n\nWhy is this happening? Is this a positive or a negative development?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience."}}$j$::jsonb,
   $j${"part1": [{"topic": "Weather and seasons", "questions": ["What is the weather like in your country at this time of year?", "Which season do you like best, and why?", "Does the weather affect your mood?", "Do you think the weather where you live is changing?"]}, {"topic": "Technology", "questions": ["What technology do you use most in your daily life?", "Do you find it easy to learn how to use new devices?", "Is there any technology you would prefer not to use?", "How did people in your parents' generation manage without it?"]}], "part2": {"title": "Describe a piece of technology that you use every day.", "bullets": ["what it is", "how long you have had it", "what you use it for"], "roundoff": "and explain how your life would be different without it."}, "part3": ["How has technology changed the way people communicate with each other?", "Do you think people depend on technology too much?", "What are the risks of children using technology from a young age?", "Will technology create more jobs than it replaces in the future?", "Should companies be responsible for the way people use their products?"]}$j$::jsonb),
  (4, $j$Mock Test 4$j$, $j$Paid mock: table report, an opinion essay on university education, and a full Speaking test.$j$, false, false,
   $j${"task1": {"type": "table", "title": "University graduates: employment and starting salary by subject, 2010 and 2020", "min_words": 150, "question": "The table below shows the percentage of graduates who found a job within six months of finishing university, and their average starting salary, for six subjects in 2010 and in 2020.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.", "data": {"caption": "Employment within six months of graduation (%) and average starting salary (US$ thousand).", "columns": ["Subject", "Employed 2010 (%)", "Employed 2020 (%)", "Salary 2010 ($000)", "Salary 2020 ($000)"], "rows": [["Engineering", "82", "91", "38", "52"], ["Medicine", "95", "97", "45", "61"], ["Business", "74", "83", "33", "44"], ["Arts and humanities", "61", "67", "26", "31"], ["Sciences", "70", "80", "31", "42"], ["Education", "85", "88", "28", "35"]]}}, "task2": {"min_words": 250, "question": "Some people argue that university courses should focus on preparing students for the world of work, rather than on academic knowledge.\n\nTo what extent do you agree or disagree with this opinion?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience."}}$j$::jsonb,
   $j${"part1": [{"topic": "Work or studies", "questions": ["Do you work or are you a student?", "What do you enjoy most about your work or studies?", "Is there anything about it that you find difficult?", "What would you like to be doing in five years' time?"]}, {"topic": "Friends", "questions": ["Do you prefer to have a few close friends or lots of friends?", "How do you usually keep in touch with your friends?", "What qualities do you value most in a friend?", "Have you made any new friends recently?"]}], "part2": {"title": "Describe a teacher who has influenced you.", "bullets": ["who the teacher was", "what subject they taught", "what they were like as a person"], "roundoff": "and explain how they influenced you."}, "part3": ["What makes someone a good teacher?", "Do you think teachers are respected as much now as they were in the past?", "Is it better to learn in a classroom or online? Why?", "How much influence should parents have on the career a young person chooses?", "Do you think studying abroad is worth the cost?"]}$j$::jsonb),
  (5, $j$Mock Test 5$j$, $j$Paid mock: process diagram, an advantages/disadvantages essay, and a full Speaking test.$j$, false, false,
   $j${"task1": {"type": "process", "title": "How plastic bottles are recycled", "min_words": 150, "question": "The diagram below shows the stages in the process of recycling plastic bottles.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.", "data": {"loop": false, "steps": [{"label": "Bottles are collected from homes and recycling bins"}, {"label": "Bottles are transported to a plant and sorted by type and colour"}, {"label": "Caps and labels are removed"}, {"label": "Bottles are shredded into small flakes"}, {"label": "Flakes are washed in hot water to remove dirt"}, {"label": "Flakes are dried and melted into plastic pellets"}, {"label": "Pellets are sold to factories"}, {"label": "Pellets are moulded into new products, such as clothing fibre and new bottles"}]}}, "task2": {"min_words": 250, "question": "Global tourism has grown enormously in recent decades.\n\nWhat are the positive and negative effects of this growth on local communities?\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience."}}$j$::jsonb,
   $j${"part1": [{"topic": "Sleep and health", "questions": ["How many hours do you usually sleep at night?", "Do you have a regular routine before you go to bed?", "What do you do to stay healthy?", "Do you think people today take enough care of their health?"]}, {"topic": "Shopping", "questions": ["Do you enjoy shopping? Why, or why not?", "Do you prefer shopping online or in shops?", "What was the last thing you bought that you were really pleased with?", "How have shopping habits changed in your country?"]}], "part2": {"title": "Describe an occasion when you had to wait for a long time.", "bullets": ["where you were", "what you were waiting for", "how you felt while you were waiting"], "roundoff": "and explain what you did to pass the time."}, "part3": ["Why do some people find it hard to be patient?", "Do you think technology has made people less willing to wait?", "In which situations is waiting acceptable, and in which is it not?", "How do different cultures view being on time?", "Do you think people today have enough free time to relax?"]}$j$::jsonb)
on conflict (number) do nothing;

commit;
