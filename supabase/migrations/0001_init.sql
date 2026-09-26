-- ALREADY APPLIED to Supabase project gpuzmgxplywdbastvjtm on 2026-09-26. Do not re-run.
create table farms (
  id text primary key,
  profile jsonb not null,
  polygon jsonb not null,
  simulated_today date not null,
  baseline_year int not null,
  derived jsonb not null,
  sources jsonb not null,
  updated_at timestamptz default now()
);
create table ndvi_observations (
  farm_id text references farms(id) on delete cascade,
  series text check (series in ('event','baseline')),
  date date, mean real, stdev real, valid_pct real,
  primary key (farm_id, series, date)
);
create table weather_daily (
  farm_id text references farms(id) on delete cascade,
  date date, precip_mm real, tmax_c real, tmean_c real, root_zone_wetness real,
  primary key (farm_id, date)
);
create table diagnoses (
  farm_id text primary key references farms(id) on delete cascade,
  content jsonb not null, model text, created_at timestamptz default now()
);
create table calls (
  id uuid primary key default gen_random_uuid(),
  farm_id text references farms(id) on delete cascade,
  language text, started_at timestamptz default now(), ended_at timestamptz
);
create table clips (
  id uuid primary key default gen_random_uuid(),
  farm_id text references farms(id) on delete cascade,
  call_id uuid references calls(id) on delete cascade,
  topic text, language text,
  video_path text, audio_path text,
  source text check (source in ('pregenerated','live')),
  status text default 'ready',
  created_at timestamptz default now()
);
create table call_events (
  id bigserial primary key,
  call_id uuid references calls(id) on delete cascade,
  type text check (type in ('user_transcript','assistant_transcript','tool_call','tool_result','clip_sent','status')),
  payload jsonb, created_at timestamptz default now()
);
create index on calls (farm_id, started_at desc);
create index on call_events (call_id, id);
create index on clips (call_id);

alter table farms enable row level security;
alter table ndvi_observations enable row level security;
alter table weather_daily enable row level security;
alter table diagnoses enable row level security;
alter table clips enable row level security;
alter table calls enable row level security;
alter table call_events enable row level security;

create policy "public read" on farms for select using (true);
create policy "public read" on ndvi_observations for select using (true);
create policy "public read" on weather_daily for select using (true);
create policy "public read" on diagnoses for select using (true);
create policy "public read" on clips for select using (true);
create policy "public read" on calls for select using (true);
create policy "public read" on call_events for select using (true);

alter publication supabase_realtime add table calls, call_events, clips;

insert into storage.buckets (id, name, public)
values ('clips', 'clips', true)
on conflict (id) do nothing;
