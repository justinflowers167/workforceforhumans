-- Baseline public-schema snapshot for WorkforceForHumans.
-- Captured 2026-04-19 by introspecting the live dbomfjqijyrkidptrrfi project.
-- Idempotent: applying to the live DB is a no-op. Required for fresh deploys.
--
-- Filename (00000000) sorts before the dated Phase-3 migrations so those
-- ALTER TABLE / CREATE POLICY statements can layer on top of this file.
--
-- This file is a *snapshot* — it will drift from the live DB over time.
-- For authoritative state, always prefer the live project or a fresh dump.

-- ─── EXTENSIONS ────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp"  with schema extensions;
create extension if not exists "pgcrypto"   with schema extensions;
create extension if not exists "vector"     with schema extensions;

-- ─── TABLES (no FKs first) ─────────────────────────────────────────────

create table if not exists public.categories (
  id          serial primary key,
  name        text    not null unique,
  slug        text    not null unique,
  icon        text,
  sort_order  integer default 0
);

create table if not exists public.skills (
  id   serial primary key,
  name text not null unique,
  slug text not null unique
);

create table if not exists public.kb_categories (
  id           serial primary key,
  name         text not null unique,
  slug         text not null unique,
  icon         text,
  description  text,
  sort_order   integer default 0,
  created_at   timestamptz default now()
);

create table if not exists public.kb_editor_emails (
  email       text primary key,
  added_by    text,
  created_at  timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id               uuid primary key default extensions.uuid_generate_v4(),
  email            text not null unique,
  first_name       text,
  interests        text[],
  subscribed_at    timestamptz default now(),
  unsubscribed_at  timestamptz,
  is_active        boolean default true
);

create table if not exists public.partner_inquiries (
  id             uuid primary key default extensions.uuid_generate_v4(),
  org_name       text not null,
  contact_name   text,
  contact_email  text not null,
  contact_title  text,
  partner_type   text,
  org_size       text,
  description    text,
  hiring_volume  text,
  status         text default 'new',
  created_at     timestamptz default now()
);

create table if not exists public.leads (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  path               text default 'individual' check (path in ('individual','partner','other')),
  first_name         text not null,
  last_name          text,
  email              text not null,
  phone              text,
  current_situation  text check (current_situation in ('recently-displaced','concerned-about-future','career-changer','returning-to-work','exploring-options')),
  industry           text,
  org_name           text,
  partner_type       text check (partner_type in ('employer','workforce-org','education','strategic')),
  message            text,
  source_page        text default 'homepage',
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  status             text default 'new' check (status in ('new','contacted','qualified','converted','archived')),
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists public.agencies (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  name                text not null,
  agency_type         text default 'other' check (agency_type in ('american-job-center','wioa','state-workforce','veterans','disability','reentry','youth','senior','nonprofit','community-college','other')),
  description         text,
  website             text,
  phone               text,
  email               text,
  location_city       text,
  location_state      text not null,
  location_zip        text,
  address             text,
  serves_remote       boolean default false,
  services            text[] default '{}',
  industries          text[] default '{}',
  populations         text[] default '{}',
  is_verified         boolean default false,
  is_active           boolean default true,
  last_verified_at    timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table if not exists public.training_resources (
  id                uuid primary key default extensions.uuid_generate_v4(),
  source            text not null,
  source_url        text not null,
  source_id         text,
  title             text not null,
  description       text,
  provider          text,
  thumbnail_url     text,
  category_slug     text,
  skill_level       text default 'beginner' check (skill_level in ('beginner','intermediate','advanced','all-levels')),
  content_type      text default 'course'   check (content_type in ('video','course','certification','article','tutorial','bootcamp','workshop','guide')),
  duration_minutes  integer,
  is_free           boolean default true,
  cost_usd          numeric,
  tags              text[] default '{}',
  industries        text[] default '{}',
  embedding         extensions.vector,
  is_verified       boolean default false,
  is_featured       boolean default false,
  view_count        integer default 0,
  recommend_count   integer default 0,
  published_at      timestamptz,
  fetched_at        timestamptz default now(),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists public.feed_items (
  id              uuid primary key default extensions.uuid_generate_v4(),
  source          text not null,
  source_url      text,
  source_id       text,
  item_type       text default 'layoff' check (item_type in ('layoff','hiring-surge','industry-news','policy-change','opportunity')),
  title           text not null,
  summary         text,
  company_name    text,
  industry        text,
  location_state  text,
  location_city   text,
  affected_count  integer,
  tags            text[] default '{}',
  categories      text[] default '{}',
  severity        text default 'medium' check (severity in ('low','medium','high','critical')),
  embedding       extensions.vector,
  is_verified     boolean default false,
  is_published    boolean default true,
  is_actionable   boolean default false,
  event_date      date,
  fetched_at      timestamptz default now(),
  published_at    timestamptz default now(),
  created_at      timestamptz default now()
);

create table if not exists public.stripe_webhook_events (
  id               uuid primary key default gen_random_uuid(),
  stripe_event_id  text not null unique,
  event_type       text not null,
  payload          jsonb not null,
  status           text not null default 'pending' check (status in ('pending','success','failed','skipped')),
  error_message    text,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz
);

-- ─── TABLES (with FKs) ─────────────────────────────────────────────────

create table if not exists public.employers (
  id                                uuid primary key default extensions.uuid_generate_v4(),
  name                              text not null,
  slug                              text not null unique,
  website                           text,
  logo_url                          text,
  description                       text,
  industry                          text,
  size                              text check (size in ('1-10','11-50','51-200','201-500','500+')),
  location_city                     text,
  location_state                    text,
  is_verified                       boolean default false,
  stripe_customer_id                text,
  contact_email                     text not null unique,
  contact_name                      text,
  created_at                        timestamptz default now(),
  updated_at                        timestamptz default now(),
  auth_user_id                      uuid unique references auth.users(id) on delete set null,
  subscription_id                   text,
  subscription_status               text check (subscription_status in ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid')),
  subscription_current_period_end   timestamptz
);

create table if not exists public.job_seekers (
  id                   uuid primary key default extensions.uuid_generate_v4(),
  auth_user_id         uuid unique references auth.users(id) on delete set null,
  first_name           text,
  last_name            text,
  email                text not null unique,
  phone                text,
  location_city        text,
  location_state       text,
  headline             text,
  summary              text,
  resume_url           text,
  linkedin_url         text,
  open_to_remote       boolean default false,
  open_to_relocation   boolean default false,
  career_stage         text check (career_stage in ('entry-level','early-career','mid-career','senior','career-changer','returning-to-work','late-career','pre-retirement')),
  desired_pay_min      numeric,
  desired_pay_type     text check (desired_pay_type in ('hourly','salary')),
  newsletter_opt_in    boolean default true,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  embedding            extensions.vector,
  open_to_recruiters   boolean not null default false,
  desired_roles        text[] not null default '{}',
  desired_skills       text[] not null default '{}'
);

create table if not exists public.jobs (
  id                            uuid primary key default extensions.uuid_generate_v4(),
  employer_id                   uuid references public.employers(id),
  category_id                   integer references public.categories(id),
  title                         text not null,
  slug                          text not null unique,
  description                   text not null,
  responsibilities              text[],
  requirements                  text[],
  nice_to_have                  text[],
  location_city                 text,
  location_state                text,
  location_zip                  text,
  is_remote                     boolean default false,
  is_hybrid                     boolean default false,
  is_onsite                     boolean default true,
  employment_type               text default 'full-time' check (employment_type in ('full-time','part-time','contract','temporary','internship','apprenticeship','per-diem')),
  experience_level              text default 'entry-level' check (experience_level in ('entry-level','mid-level','senior','manager','director','executive','no-experience-required')),
  education_required            text default 'no-requirement' check (education_required in ('no-requirement','high-school','some-college','associate','bachelor','master','doctorate','trade-certification')),
  pay_type                      text default 'hourly' check (pay_type in ('hourly','salary','commission','volunteer')),
  pay_min                       numeric,
  pay_max                       numeric,
  pay_currency                  text default 'USD',
  benefits                      text[],
  apply_url                     text,
  apply_email                   text,
  apply_via_platform            boolean default false,
  status                        text default 'active' check (status in ('draft','active','paused','filled','expired')),
  is_featured                   boolean default false,
  is_entry_level_highlighted    boolean default false,
  is_senior_friendly            boolean default false,
  meta_title                    text,
  meta_description              text,
  view_count                    integer default 0,
  application_count             integer default 0,
  posted_at                     timestamptz default now(),
  expires_at                    timestamptz default (now() + interval '60 days'),
  filled_at                     timestamptz,
  created_at                    timestamptz default now(),
  updated_at                    timestamptz default now(),
  embedding                     extensions.vector
);

create table if not exists public.job_skills (
  job_id   uuid    not null references public.jobs(id) on delete cascade,
  skill_id integer not null references public.skills(id) on delete cascade,
  primary key (job_id, skill_id)
);

create table if not exists public.job_seeker_skills (
  job_seeker_id    uuid    not null references public.job_seekers(id) on delete cascade,
  skill_id         integer not null references public.skills(id) on delete cascade,
  years_experience integer,
  primary key (job_seeker_id, skill_id)
);

create table if not exists public.kb_articles (
  id                 uuid primary key default extensions.uuid_generate_v4(),
  category_id        integer references public.kb_categories(id),
  title              text not null,
  slug               text not null unique,
  summary            text,
  body               text not null,
  tags               text[] default '{}',
  status             text default 'draft' check (status in ('draft','published','archived')),
  is_featured        boolean default false,
  is_pinned          boolean default false,
  reading_time_min   integer default 3,
  author_name        text default 'Workforce for Humans',
  meta_title         text,
  meta_description   text,
  view_count         integer default 0,
  helpful_yes        integer default 0,
  helpful_no         integer default 0,
  published_at       timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists public.kb_related_articles (
  article_id uuid not null references public.kb_articles(id) on delete cascade,
  related_id uuid not null references public.kb_articles(id) on delete cascade,
  primary key (article_id, related_id)
);

create table if not exists public.applications (
  id               uuid primary key default extensions.uuid_generate_v4(),
  job_id           uuid references public.jobs(id) on delete cascade,
  job_seeker_id    uuid references public.job_seekers(id) on delete set null,
  applicant_name   text,
  applicant_email  text,
  applicant_phone  text,
  cover_letter     text,
  resume_url       text,
  status           text default 'submitted' check (status in ('submitted','viewed','shortlisted','interviewing','offered','hired','rejected','withdrawn')),
  employer_notes   text,
  applied_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists public.saved_jobs (
  id             uuid primary key default extensions.uuid_generate_v4(),
  job_seeker_id  uuid references public.job_seekers(id) on delete cascade,
  job_id         uuid references public.jobs(id) on delete cascade,
  saved_at       timestamptz default now()
);

create table if not exists public.match_scores (
  id                uuid primary key default extensions.uuid_generate_v4(),
  job_seeker_id     uuid references public.job_seekers(id) on delete cascade,
  match_type        text not null check (match_type in ('job','training','feed_item','agency')),
  match_target_id   uuid not null,
  similarity        double precision not null,
  match_reasons     text[] default '{}',
  is_seen           boolean default false,
  is_dismissed      boolean default false,
  is_saved          boolean default false,
  scored_at         timestamptz default now(),
  score             integer,
  rationale         text,
  emailed_at        timestamptz
);

create table if not exists public.resumes (
  id             uuid primary key default extensions.uuid_generate_v4(),
  job_seeker_id  uuid not null references public.job_seekers(id) on delete cascade,
  source         text not null check (source in ('paste','upload','builder')),
  raw_text       text,
  file_path      text,
  parsed_json    jsonb,
  review_json    jsonb,
  is_current     boolean not null default true,
  status         text    not null default 'pending' check (status in ('pending','parsed','failed')),
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.job_postings (
  id                     uuid primary key default extensions.uuid_generate_v4(),
  job_id                 uuid references public.jobs(id) on delete set null,
  employer_id            uuid references public.employers(id) on delete cascade,
  plan                   text default 'basic' check (plan in ('basic','standard','featured')),
  amount_cents           integer,
  currency               text default 'USD',
  stripe_payment_id      text,
  stripe_session_id      text,
  status                 text default 'pending' check (status in ('pending','paid','refunded','failed')),
  paid_at                timestamptz,
  listing_duration_days  integer default 60,
  created_at             timestamptz default now(),
  stripe_event_id        text
);

create table if not exists public.job_alerts (
  id                uuid primary key default extensions.uuid_generate_v4(),
  email             text not null,
  job_seeker_id     uuid references public.job_seekers(id) on delete cascade,
  keywords          text,
  category_id       integer references public.categories(id) on delete set null,
  location_state    text,
  is_remote         boolean,
  experience_level  text,
  pay_min           numeric,
  frequency         text default 'weekly' check (frequency in ('daily','weekly')),
  is_active         boolean default true,
  last_sent_at      timestamptz,
  created_at        timestamptz default now()
);

create table if not exists public.assessment_submissions (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  lead_id               uuid references public.leads(id) on delete set null,
  job_seeker_id         uuid references public.job_seekers(id) on delete set null,
  email                 text not null,
  responses             jsonb default '{}',
  recommended_paths     text[],
  career_stage          text,
  tech_comfort_level    text check (tech_comfort_level in ('low','medium','high')),
  transferable_skills   text[],
  completed             boolean default false,
  completed_at          timestamptz,
  created_at            timestamptz default now()
);

create table if not exists public.recruiter_contact_views (
  id            uuid primary key default extensions.uuid_generate_v4(),
  employer_id   uuid not null references public.employers(id) on delete cascade,
  job_seeker_id uuid not null references public.job_seekers(id) on delete cascade,
  job_id        uuid references public.jobs(id) on delete set null,
  viewed_at     timestamptz not null default now()
);

-- ─── VIEWS ─────────────────────────────────────────────────────────────

create or replace view public.jobs_full as
  select j.id, j.employer_id, j.category_id, j.title, j.slug, j.description,
         j.responsibilities, j.requirements, j.nice_to_have,
         j.location_city, j.location_state, j.location_zip,
         j.is_remote, j.is_hybrid, j.is_onsite,
         j.employment_type, j.experience_level, j.education_required,
         j.pay_type, j.pay_min, j.pay_max, j.pay_currency,
         j.benefits, j.apply_url, j.apply_email, j.apply_via_platform,
         j.status, j.is_featured, j.is_entry_level_highlighted, j.is_senior_friendly,
         j.meta_title, j.meta_description, j.view_count, j.application_count,
         j.posted_at, j.expires_at, j.filled_at, j.created_at, j.updated_at,
         e.name        as employer_name,
         e.slug        as employer_slug,
         e.logo_url    as employer_logo,
         e.is_verified as employer_verified,
         e.location_city  as employer_city,
         e.location_state as employer_state,
         c.name as category_name,
         c.slug as category_slug,
         c.icon as category_icon
  from jobs j
    left join employers e on e.id = j.employer_id
    left join categories c on c.id = j.category_id
  where j.status = 'active' and j.expires_at > now();

create or replace view public.platform_stats as
  select (select count(*) from jobs where status = 'active' and expires_at > now()) as active_jobs,
         (select count(*) from employers where is_verified = true)                  as verified_employers,
         (select count(*) from job_seekers)                                         as job_seekers,
         (select count(*) from categories)                                          as categories,
         (select count(*) from jobs where experience_level = any (array['entry-level','no-experience-required']) and status = 'active') as entry_level_jobs,
         (select count(*) from jobs where is_senior_friendly = true and status = 'active') as senior_friendly_jobs;

create or replace view public.feed_stats as
  select (select count(*) from feed_items where is_published = true)                                                as total_feed_items,
         (select count(*) from feed_items where item_type = 'layoff' and is_published = true)                       as layoff_alerts,
         (select count(*) from agencies where is_active = true)                                                     as active_agencies,
         (select count(*) from training_resources)                                                                  as training_resources,
         (select count(*) from training_resources where is_free = true)                                             as free_resources;

create or replace view public.kb_stats as
  select (select count(*) from kb_articles where status = 'published') as published_articles,
         (select count(*) from kb_categories)                          as total_categories,
         (select coalesce(sum(view_count), 0) from kb_articles)        as total_views;

create or replace view public.leads_summary as
  select path, status, count(*)::integer as count, max(created_at) as latest
    from leads
   group by path, status
   order by path, status;

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────

alter table public.agencies                enable row level security;
alter table public.applications            enable row level security;
alter table public.assessment_submissions  enable row level security;
alter table public.categories              enable row level security;
alter table public.employers               enable row level security;
alter table public.feed_items              enable row level security;
alter table public.job_alerts              enable row level security;
alter table public.job_postings            enable row level security;
alter table public.job_seeker_skills       enable row level security;
alter table public.job_seekers             enable row level security;
alter table public.job_skills              enable row level security;
alter table public.jobs                    enable row level security;
alter table public.kb_articles             enable row level security;
alter table public.kb_categories           enable row level security;
alter table public.kb_editor_emails        enable row level security;
alter table public.kb_related_articles     enable row level security;
alter table public.leads                   enable row level security;
alter table public.match_scores            enable row level security;
alter table public.newsletter_subscribers  enable row level security;
alter table public.partner_inquiries       enable row level security;
alter table public.recruiter_contact_views enable row level security;
alter table public.resumes                 enable row level security;
alter table public.saved_jobs              enable row level security;
alter table public.skills                  enable row level security;
alter table public.stripe_webhook_events   enable row level security;
alter table public.training_resources      enable row level security;

-- ─── POLICIES ─────────────────────────────────────────────────────────
-- Pattern: DROP POLICY IF EXISTS … then CREATE POLICY (idempotent).

drop policy if exists "Public can view active agencies" on public.agencies;
create policy "Public can view active agencies" on public.agencies
  for select to public using (is_active = true);

drop policy if exists "Job seekers can apply" on public.applications;
create policy "Job seekers can apply" on public.applications
  for insert to public with check (true);

drop policy if exists "Job seekers own applications" on public.applications;
create policy "Job seekers own applications" on public.applications
  for select to public using (job_seeker_id in (select id from public.job_seekers where auth_user_id = auth.uid()));

drop policy if exists "Public can insert assessments" on public.assessment_submissions;
create policy "Public can insert assessments" on public.assessment_submissions
  for insert to public with check (true);

drop policy if exists "Users can view own assessments" on public.assessment_submissions;
create policy "Users can view own assessments" on public.assessment_submissions
  for select to public using (
    job_seeker_id in (select id from public.job_seekers where auth_user_id = auth.uid())
    or auth.role() = 'service_role'
  );

drop policy if exists "Public can view categories" on public.categories;
create policy "Public can view categories" on public.categories
  for select to public using (true);

drop policy if exists "Public can view employers" on public.employers;
create policy "Public can view employers" on public.employers
  for select to public using (true);

drop policy if exists "Employer owner can update self" on public.employers;
create policy "Employer owner can update self" on public.employers
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

drop policy if exists "Public can view published feed items" on public.feed_items;
create policy "Public can view published feed items" on public.feed_items
  for select to public using (is_published = true);

drop policy if exists "Anyone can create a job alert" on public.job_alerts;
create policy "Anyone can create a job alert" on public.job_alerts
  for insert to public with check (true);

drop policy if exists "Job seekers can view own alerts" on public.job_alerts;
create policy "Job seekers can view own alerts" on public.job_alerts
  for select to public using (job_seeker_id in (select id from public.job_seekers where auth_user_id = auth.uid()));

drop policy if exists "Job seekers can delete own alerts" on public.job_alerts;
create policy "Job seekers can delete own alerts" on public.job_alerts
  for delete to public using (job_seeker_id in (select id from public.job_seekers where auth_user_id = auth.uid()));

drop policy if exists "Employers can view own job postings" on public.job_postings;
create policy "Employers can view own job postings" on public.job_postings
  for select to public using (
    employer_id in (
      select id from public.employers
        where contact_email = (select email::text from auth.users where id = auth.uid())
    )
  );

drop policy if exists "jss_self_rw" on public.job_seeker_skills;
create policy "jss_self_rw" on public.job_seeker_skills
  for all to public
  using     (exists (select 1 from public.job_seekers js where js.id = job_seeker_skills.job_seeker_id and js.auth_user_id = auth.uid()))
  with check(exists (select 1 from public.job_seekers js where js.id = job_seeker_skills.job_seeker_id and js.auth_user_id = auth.uid()));

drop policy if exists "Job seekers own profile" on public.job_seekers;
create policy "Job seekers own profile" on public.job_seekers
  for all to public using (auth.uid() = auth_user_id);

drop policy if exists "Public can view job skills" on public.job_skills;
create policy "Public can view job skills" on public.job_skills
  for select to public using (true);

drop policy if exists "Public can view active jobs" on public.jobs;
create policy "Public can view active jobs" on public.jobs
  for select to public using (status = 'active' and expires_at > now());

drop policy if exists "Employer owner can read own jobs" on public.jobs;
create policy "Employer owner can read own jobs" on public.jobs
  for select to authenticated using (employer_id in (select id from public.employers where auth_user_id = auth.uid()));

drop policy if exists "Public can view published kb articles" on public.kb_articles;
create policy "Public can view published kb articles" on public.kb_articles
  for select to public using (status = 'published');

drop policy if exists "KB editors can insert" on public.kb_articles;
create policy "KB editors can insert" on public.kb_articles
  for insert to authenticated
  with check (lower((auth.jwt() ->> 'email')) in (select lower(email) from public.kb_editor_emails));

drop policy if exists "KB editors can update" on public.kb_articles;
create policy "KB editors can update" on public.kb_articles
  for update to authenticated
  using      (lower((auth.jwt() ->> 'email')) in (select lower(email) from public.kb_editor_emails))
  with check (lower((auth.jwt() ->> 'email')) in (select lower(email) from public.kb_editor_emails));

drop policy if exists "KB editors can delete" on public.kb_articles;
create policy "KB editors can delete" on public.kb_articles
  for delete to authenticated
  using (lower((auth.jwt() ->> 'email')) in (select lower(email) from public.kb_editor_emails));

drop policy if exists "Public can view kb categories" on public.kb_categories;
create policy "Public can view kb categories" on public.kb_categories
  for select to public using (true);

drop policy if exists "kb_editor_emails read for authenticated" on public.kb_editor_emails;
create policy "kb_editor_emails read for authenticated" on public.kb_editor_emails
  for select to authenticated using (true);

drop policy if exists "Public can view kb related articles" on public.kb_related_articles;
create policy "Public can view kb related articles" on public.kb_related_articles
  for select to public using (true);

drop policy if exists "Public can submit leads" on public.leads;
create policy "Public can submit leads" on public.leads
  for insert to public with check (true);

drop policy if exists "Service role can read leads" on public.leads;
create policy "Service role can read leads" on public.leads
  for select to public using (auth.role() = 'service_role');

drop policy if exists "Job seekers own match scores" on public.match_scores;
create policy "Job seekers own match scores" on public.match_scores
  for select to public using (job_seeker_id in (select id from public.job_seekers where auth_user_id = auth.uid()));

drop policy if exists "Anyone can subscribe to newsletter" on public.newsletter_subscribers;
create policy "Anyone can subscribe to newsletter" on public.newsletter_subscribers
  for insert to public with check (true);

drop policy if exists "Subscribers can manage own subscription" on public.newsletter_subscribers;
create policy "Subscribers can manage own subscription" on public.newsletter_subscribers
  for update to public using (true) with check (true);

drop policy if exists "Public can submit partner inquiries" on public.partner_inquiries;
create policy "Public can submit partner inquiries" on public.partner_inquiries
  for insert to public with check (true);

drop policy if exists "rcv_employer_read" on public.recruiter_contact_views;
create policy "rcv_employer_read" on public.recruiter_contact_views
  for select to public using (
    exists (select 1 from public.employers e where e.id = recruiter_contact_views.employer_id and e.contact_email = auth.email())
  );

drop policy if exists "resumes_self_rw" on public.resumes;
create policy "resumes_self_rw" on public.resumes
  for all to public
  using      (exists (select 1 from public.job_seekers js where js.id = resumes.job_seeker_id and js.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.job_seekers js where js.id = resumes.job_seeker_id and js.auth_user_id = auth.uid()));

drop policy if exists "Own saved jobs" on public.saved_jobs;
create policy "Own saved jobs" on public.saved_jobs
  for all to public using (job_seeker_id in (select id from public.job_seekers where auth_user_id = auth.uid()));

drop policy if exists "skills_read" on public.skills;
create policy "skills_read" on public.skills
  for select to public using (true);

drop policy if exists "Public can view training resources" on public.training_resources;
create policy "Public can view training resources" on public.training_resources
  for select to public using (true);

-- stripe_webhook_events: no policies (service-role only — Phase 3 convention).
