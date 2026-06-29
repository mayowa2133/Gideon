create table if not exists gideon_usage_events (
  id text primary key,
  workspace_id text not null,
  project_id text,
  metric varchar(64) not null,
  quantity numeric(20, 6) not null,
  unit varchar(32) not null,
  source varchar(64) not null,
  idempotency_key varchar(191) not null,
  record_json jsonb not null,
  created_at timestamptz not null
);

create unique index if not exists gideon_usage_events_workspace_idempotency_key_idx
  on gideon_usage_events (workspace_id, idempotency_key);

create index if not exists gideon_usage_events_workspace_metric_created_idx
  on gideon_usage_events (workspace_id, metric, created_at desc);

create index if not exists gideon_usage_events_project_created_idx
  on gideon_usage_events (workspace_id, project_id, created_at desc)
  where project_id is not null;

create table if not exists gideon_audit_events (
  id text primary key,
  workspace_id text not null,
  project_id text,
  actor_user_id text not null,
  actor_type varchar(32) not null,
  action varchar(80) not null,
  target_type varchar(48) not null,
  target_id text,
  summary text not null,
  metadata_json jsonb,
  record_json jsonb not null,
  created_at timestamptz not null
);

create index if not exists gideon_audit_events_workspace_created_idx
  on gideon_audit_events (workspace_id, created_at desc);

create index if not exists gideon_audit_events_project_created_idx
  on gideon_audit_events (workspace_id, project_id, created_at desc)
  where project_id is not null;

create index if not exists gideon_audit_events_action_created_idx
  on gideon_audit_events (workspace_id, action, created_at desc);
