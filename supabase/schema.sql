create table if not exists public.post_runs (
  run_id text primary key,
  source_url text not null default '',
  provider text not null default '',
  stage text not null default '',
  caption_english text not null default '',
  caption_portuguese text not null default '',
  hashtags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drive_exports (
  id bigserial primary key,
  run_id text not null references public.post_runs(run_id) on delete cascade,
  profile_folder_id text not null default '',
  profile_folder_name text not null default '',
  post_folder_id text not null default '',
  post_folder_name text not null default '',
  post_folder_url text not null default '',
  files jsonb not null default '[]',
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.post_events (
  id bigserial primary key,
  run_id text not null references public.post_runs(run_id) on delete cascade,
  type text not null,
  message text not null default '',
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.post_runs enable row level security;
alter table public.drive_exports enable row level security;
alter table public.post_events enable row level security;
