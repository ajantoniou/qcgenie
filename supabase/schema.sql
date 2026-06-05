create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null check (plan in ('studio', 'growth')),
  monthly_minutes integer not null,
  created_at timestamptz not null default now()
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
