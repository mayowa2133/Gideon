create table if not exists gideon_capture_cleanup_tasks (
  id char(64) primary key,
  workspace_id text not null,
  project_id text not null,
  target_kind varchar(16) not null check (target_kind in ('secret','object')),
  target_reference text not null,
  provider varchar(32),
  status varchar(16) not null check (status in ('pending','completed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  safe_error_code varchar(80),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_capture_cleanup_tasks_target_idx
  on gideon_capture_cleanup_tasks (workspace_id, project_id, target_kind, target_reference);

create index if not exists gideon_capture_cleanup_tasks_pending_idx
  on gideon_capture_cleanup_tasks (status, updated_at)
  where status in ('pending','failed');
