create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null check (plan in ('studio', 'growth')),
  monthly_minutes integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  storage_path text not null,
  source_filename text,
  content_type text,
  size_bytes bigint,
  status text not null check (status in ('created', 'uploaded', 'metadata_probe', 'ready', 'failed')),
  error_code text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.qc_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  source_url text,
  title text not null,
  asset_type text not null,
  minutes numeric(8, 2) not null check (minutes > 0),
  status text not null default 'queued' check (
    status in (
      'queued',
      'ingesting',
      'metadata_probe',
      'transcribing',
      'deterministic_qc',
      'agent_review',
      'reporting',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  progress_pct integer not null default 0 check (progress_pct >= 0 and progress_pct <= 100),
  verdict text check (verdict in ('PASS', 'WATCH', 'BLOCK')),
  idempotency_key text,
  callback_url text,
  error_code text,
  error_message text,
  source_hash text,
  duration_seconds numeric(10, 3),
  frame_rate numeric(8, 3),
  coverage_pct integer check (coverage_pct >= 0 and coverage_pct <= 100),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.qc_flags (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.qc_jobs(id) on delete cascade,
  gate text not null,
  severity text not null check (severity in ('pass', 'warn', 'block')),
  timestamp text not null,
  summary text not null,
  transcript_evidence text,
  evidence_source text not null default 'deterministic' check (evidence_source in ('deterministic', 'transcript', 'agent_review')),
  threshold_snapshot jsonb not null default '{}'::jsonb,
  artifact_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists qc_jobs_workspace_created_idx on public.qc_jobs(workspace_id, created_at desc);
create index if not exists qc_jobs_workspace_status_idx on public.qc_jobs(workspace_id, status, created_at desc);
create unique index if not exists qc_jobs_workspace_idempotency_idx on public.qc_jobs(workspace_id, idempotency_key) where idempotency_key is not null;
create index if not exists qc_flags_job_idx on public.qc_flags(job_id);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id, workspace_id);

create table if not exists public.qc_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.qc_jobs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.qc_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.qc_jobs(id) on delete cascade,
  artifact_type text not null check (
    artifact_type in ('transcript', 'thumbnail', 'frame_sample', 'preview_clip', 'waveform', 'json_report', 'pdf_report', 'marker_export')
  ),
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null,
  secret_hash text not null,
  event_types text[] not null default '{job.completed,job.failed}',
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  job_id uuid references public.qc_jobs(id) on delete set null,
  event_type text not null,
  payload jsonb not null,
  status text not null check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid references public.qc_jobs(id) on delete set null,
  billing_period text not null,
  rounded_minutes integer not null check (rounded_minutes > 0),
  created_at timestamptz not null default now()
);

create index if not exists api_keys_workspace_idx on public.api_keys(workspace_id);
create index if not exists uploads_workspace_status_idx on public.uploads(workspace_id, status, created_at desc);
create index if not exists qc_job_events_job_idx on public.qc_job_events(job_id, created_at desc);
create index if not exists qc_artifacts_job_idx on public.qc_artifacts(job_id);
create index if not exists webhook_endpoints_workspace_idx on public.webhook_endpoints(workspace_id);
create index if not exists usage_ledger_workspace_period_idx on public.usage_ledger(workspace_id, billing_period);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.api_keys enable row level security;
alter table public.uploads enable row level security;
alter table public.qc_jobs enable row level security;
alter table public.qc_flags enable row level security;
alter table public.qc_job_events enable row level security;
alter table public.qc_artifacts enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.usage_ledger enable row level security;

drop policy if exists "Workspace members can view their memberships" on public.workspace_members;
drop policy if exists "Workspace members can view workspaces" on public.workspaces;
drop policy if exists "Workspace members can view uploads" on public.uploads;
drop policy if exists "Workspace editors can create uploads" on public.uploads;
drop policy if exists "Workspace members can view QC jobs" on public.qc_jobs;
drop policy if exists "Workspace editors can create QC jobs" on public.qc_jobs;
drop policy if exists "Workspace editors can cancel or update QC jobs" on public.qc_jobs;
drop policy if exists "Workspace members can view QC flags" on public.qc_flags;
drop policy if exists "Workspace members can view QC job events" on public.qc_job_events;
drop policy if exists "Workspace members can view QC artifacts" on public.qc_artifacts;
drop policy if exists "Workspace admins can view webhook delivery logs" on public.webhook_deliveries;
drop policy if exists "Workspace members can view usage ledger" on public.usage_ledger;

comment on table public.api_keys is 'Server-only API key metadata. RLS is enabled with no client policies because key hashes must be read only by trusted backend/service-role code.';
comment on table public.webhook_endpoints is 'Server-only webhook endpoint metadata. RLS is enabled with no client policies because signing secret hashes must be read only by trusted backend/service-role code.';

create policy "Workspace members can view their memberships"
on public.workspace_members
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Workspace members can view workspaces"
on public.workspaces
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspaces.id
      and wm.user_id = (select auth.uid())
  )
);

create policy "Workspace members can view uploads"
on public.uploads
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = uploads.workspace_id
      and wm.user_id = (select auth.uid())
  )
);

create policy "Workspace editors can create uploads"
on public.uploads
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = uploads.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin', 'editor')
  )
);

create policy "Workspace members can view QC jobs"
on public.qc_jobs
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = qc_jobs.workspace_id
      and wm.user_id = (select auth.uid())
  )
);

create policy "Workspace editors can create QC jobs"
on public.qc_jobs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = qc_jobs.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin', 'editor')
  )
);

create policy "Workspace editors can cancel or update QC jobs"
on public.qc_jobs
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = qc_jobs.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = qc_jobs.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin', 'editor')
  )
);

create policy "Workspace members can view QC flags"
on public.qc_flags
for select
to authenticated
using (
  exists (
    select 1
    from public.qc_jobs job
    join public.workspace_members wm on wm.workspace_id = job.workspace_id
    where job.id = qc_flags.job_id
      and wm.user_id = (select auth.uid())
  )
);

create policy "Workspace members can view QC job events"
on public.qc_job_events
for select
to authenticated
using (
  exists (
    select 1
    from public.qc_jobs job
    join public.workspace_members wm on wm.workspace_id = job.workspace_id
    where job.id = qc_job_events.job_id
      and wm.user_id = (select auth.uid())
  )
);

create policy "Workspace members can view QC artifacts"
on public.qc_artifacts
for select
to authenticated
using (
  exists (
    select 1
    from public.qc_jobs job
    join public.workspace_members wm on wm.workspace_id = job.workspace_id
    where job.id = qc_artifacts.job_id
      and wm.user_id = (select auth.uid())
  )
);

create policy "Workspace admins can view webhook delivery logs"
on public.webhook_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.webhook_endpoints endpoint
    join public.workspace_members wm on wm.workspace_id = endpoint.workspace_id
    where endpoint.id = webhook_deliveries.endpoint_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  )
);

create policy "Workspace members can view usage ledger"
on public.usage_ledger
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = usage_ledger.workspace_id
      and wm.user_id = (select auth.uid())
  )
);
