create table if not exists gideon_users (
  id text primary key,
  email text not null,
  display_name text not null,
  auth_subject text,
  identity_provider varchar(32),
  last_signed_in_at timestamptz,
  record_json jsonb not null,
  created_at timestamptz not null
);

create unique index if not exists gideon_users_email_idx
  on gideon_users (lower(email));

create index if not exists gideon_users_auth_subject_idx
  on gideon_users (identity_provider, auth_subject)
  where auth_subject is not null;

create table if not exists gideon_workspaces (
  id text primary key,
  name text not null,
  slug text not null,
  plan varchar(32) not null,
  billing_status varchar(32) not null,
  billing_provider varchar(32),
  billing_customer_id text,
  billing_subscription_id text,
  billing_current_period_end timestamptz,
  billing_cancel_at_period_end boolean,
  billing_last_event_id text,
  entitlements_json jsonb not null,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_workspaces_slug_idx
  on gideon_workspaces (slug);

create index if not exists gideon_workspaces_billing_customer_idx
  on gideon_workspaces (billing_provider, billing_customer_id)
  where billing_customer_id is not null;

create index if not exists gideon_workspaces_billing_subscription_idx
  on gideon_workspaces (billing_provider, billing_subscription_id)
  where billing_subscription_id is not null;

create table if not exists gideon_workspace_members (
  id text primary key,
  workspace_id text not null,
  user_id text not null,
  role varchar(32) not null,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz
);

create unique index if not exists gideon_workspace_members_workspace_user_idx
  on gideon_workspace_members (workspace_id, user_id);

create index if not exists gideon_workspace_members_user_idx
  on gideon_workspace_members (user_id, workspace_id);

create table if not exists gideon_projects (
  id text primary key,
  workspace_id text not null,
  name text not null,
  status varchar(48) not null,
  profile_json jsonb not null,
  recording_artifact_id text,
  source_storage_key text,
  transcript_status varchar(32),
  analysis_summary text,
  moment_count integer not null default 0,
  script_count integer not null default 0,
  render_count integer not null default 0,
  artifact_count integer not null default 0,
  upload_session_count integer not null default 0,
  provider_run_count integer not null default 0,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists gideon_projects_workspace_status_updated_idx
  on gideon_projects (workspace_id, status, updated_at desc);

create index if not exists gideon_projects_workspace_created_idx
  on gideon_projects (workspace_id, created_at desc);

create table if not exists gideon_recording_upload_sessions (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  artifact_id text not null,
  provider varchar(32) not null,
  storage_key text not null,
  status varchar(32) not null,
  content_type text not null,
  byte_size bigint not null,
  original_file_name text not null,
  expires_at timestamptz not null,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists gideon_recording_upload_sessions_project_created_idx
  on gideon_recording_upload_sessions (workspace_id, project_id, created_at desc);

create index if not exists gideon_recording_upload_sessions_status_expires_idx
  on gideon_recording_upload_sessions (status, expires_at);
