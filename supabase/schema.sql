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

create table if not exists public.post_destinations (
  id bigserial primary key,
  run_id text not null references public.post_runs(run_id) on delete cascade,
  account_id text not null,
  account_name text not null default '',
  account_handle text not null default '',
  scheduled_at timestamptz,
  status text not null default 'draft',
  postiz_post_id text,
  postiz_response jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, account_id)
);

create table if not exists public.post_events (
  id bigserial primary key,
  run_id text not null references public.post_runs(run_id) on delete cascade,
  account_id text,
  type text not null,
  message text not null default '',
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.post_runs enable row level security;
alter table public.post_destinations enable row level security;
alter table public.post_events enable row level security;
