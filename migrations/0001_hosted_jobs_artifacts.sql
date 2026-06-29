create table if not exists gideon_jobs (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  kind varchar(48) not null,
  queue_name varchar(80) not null,
  status varchar(32) not null,
  stage varchar(80) not null,
  attempt smallint not null,
  max_attempts smallint not null,
  progress_current bigint not null default 0,
  progress_total bigint not null default 1,
  progress_unit varchar(32) not null default 'step',
  user_message text not null,
  cancelable boolean not null,
  retryable boolean not null,
  safe_error text,
  idempotency_key varchar(191) not null,
  input_json jsonb not null default '{}'::jsonb,
  result_json jsonb,
  record_json jsonb not null,
  worker_id text,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_jobs_workspace_kind_idempotency_key_idx
  on gideon_jobs (workspace_id, kind, idempotency_key);

create index if not exists gideon_jobs_workspace_project_created_idx
  on gideon_jobs (workspace_id, project_id, created_at desc);

create index if not exists gideon_jobs_queue_status_created_idx
  on gideon_jobs (queue_name, status, created_at);

create index if not exists gideon_jobs_status_heartbeat_idx
  on gideon_jobs (status, heartbeat_at);

create table if not exists gideon_artifacts (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  kind varchar(48) not null,
  provider varchar(32) not null,
  storage_key text not null,
  content_type text not null,
  byte_size bigint not null,
  sha256 char(64) not null,
  original_file_name text not null,
  local_path text,
  local_url text,
  record_json jsonb not null,
  created_at timestamptz not null
);

create unique index if not exists gideon_artifacts_storage_key_idx
  on gideon_artifacts (storage_key);

create index if not exists gideon_artifacts_workspace_project_created_idx
  on gideon_artifacts (workspace_id, project_id, created_at desc);

create index if not exists gideon_artifacts_workspace_kind_created_idx
  on gideon_artifacts (workspace_id, kind, created_at desc);
