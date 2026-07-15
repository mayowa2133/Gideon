create table if not exists gideon_capture_environments (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  name text not null,
  environment_type varchar(32) not null check (environment_type in ('local_preview','staging','demo','production_sandbox')),
  status varchar(32) not null check (status in ('draft','validating','ready','failed','revoked')),
  revision integer not null check (revision > 0),
  current_version_id text,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_capture_environments_workspace_id_id_idx
  on gideon_capture_environments (workspace_id, id);

create index if not exists gideon_capture_environments_project_updated_idx
  on gideon_capture_environments (workspace_id, project_id, updated_at desc);

create table if not exists gideon_capture_environment_versions (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_id text not null,
  revision integer not null check (revision > 0),
  application_fingerprint char(64) not null,
  browser_policy_fingerprint char(64) not null,
  record_json jsonb not null,
  validated_at timestamptz not null,
  created_at timestamptz not null
);

create unique index if not exists gideon_capture_environment_versions_environment_revision_idx
  on gideon_capture_environment_versions (workspace_id, environment_id, revision);

create index if not exists gideon_capture_environment_versions_project_created_idx
  on gideon_capture_environment_versions (workspace_id, project_id, created_at desc);

create table if not exists gideon_capture_personas (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_id text not null,
  persona_key varchar(120) not null,
  status varchar(32) not null check (status in ('active','disabled')),
  revision integer not null check (revision > 0),
  credential_grant_id text,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_capture_personas_environment_key_idx
  on gideon_capture_personas (workspace_id, environment_id, persona_key);

create index if not exists gideon_capture_personas_project_updated_idx
  on gideon_capture_personas (workspace_id, project_id, updated_at desc);

create table if not exists gideon_capture_credential_grants (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_id text not null,
  persona_id text not null,
  vault_reference text not null,
  credential_kind varchar(32) not null check (credential_kind in ('username_password','session_bootstrap_token')),
  purpose varchar(48) not null check (purpose = 'capture_login'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  record_json jsonb not null,
  created_at timestamptz not null
);

create index if not exists gideon_capture_credential_grants_scope_idx
  on gideon_capture_credential_grants (workspace_id, project_id, environment_id, persona_id);

create index if not exists gideon_capture_credential_grants_expiry_idx
  on gideon_capture_credential_grants (expires_at)
  where revoked_at is null;

create table if not exists gideon_discovery_runs (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_version_id text not null,
  job_id text not null,
  status varchar(32) not null check (status in ('draft','queued','inventory','exploring','synthesizing','validating','ready_for_review','failed','canceled')),
  provider varchar(80),
  model varchar(120),
  prompt_version varchar(80) not null,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_discovery_runs_workspace_id_id_idx
  on gideon_discovery_runs (workspace_id, id);

create index if not exists gideon_discovery_runs_project_created_idx
  on gideon_discovery_runs (workspace_id, project_id, created_at desc);

create index if not exists gideon_discovery_runs_status_updated_idx
  on gideon_discovery_runs (status, updated_at);

create table if not exists gideon_ui_states (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  discovery_run_id text not null,
  environment_version_id text not null,
  url_template text not null,
  state_fingerprint char(64) not null,
  label text not null,
  record_json jsonb not null,
  created_at timestamptz not null
);

create unique index if not exists gideon_ui_states_run_fingerprint_idx
  on gideon_ui_states (workspace_id, discovery_run_id, state_fingerprint);

create index if not exists gideon_ui_states_project_created_idx
  on gideon_ui_states (workspace_id, project_id, created_at desc);

create table if not exists gideon_ui_transitions (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  discovery_run_id text not null,
  from_state_id text not null,
  to_state_id text not null,
  action_kind varchar(32) not null,
  risk_class varchar(32) not null check (risk_class in ('observe','navigate','synthetic_write','external_side_effect','financial','destructive','security_sensitive','publish_or_invite')),
  record_json jsonb not null,
  created_at timestamptz not null
);

create index if not exists gideon_ui_transitions_run_from_idx
  on gideon_ui_transitions (workspace_id, discovery_run_id, from_state_id);

create table if not exists gideon_product_flows (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_id text not null,
  persona_id text not null,
  current_revision integer not null check (current_revision > 0),
  approval_status varchar(32) not null check (approval_status in ('draft','approved','rejected')),
  title text not null,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_product_flows_workspace_id_id_idx
  on gideon_product_flows (workspace_id, id);

create index if not exists gideon_product_flows_project_updated_idx
  on gideon_product_flows (workspace_id, project_id, updated_at desc);

create table if not exists gideon_product_flow_revisions (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  flow_id text not null,
  revision integer not null check (revision > 0),
  environment_version_id text not null,
  persona_id text not null,
  approval_status varchar(32) not null check (approval_status in ('draft','approved','rejected')),
  record_json jsonb not null,
  created_at timestamptz not null
);

create unique index if not exists gideon_product_flow_revisions_flow_revision_idx
  on gideon_product_flow_revisions (workspace_id, flow_id, revision);

create index if not exists gideon_product_flow_revisions_project_created_idx
  on gideon_product_flow_revisions (workspace_id, project_id, created_at desc);

create table if not exists gideon_capture_runs (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_version_id text not null,
  job_id text not null,
  status varchar(32) not null check (status in ('queued','provisioning','resetting','authenticating','dry_running','repairing','recording','normalizing','verifying','completed','needs_review','failed','canceled')),
  policy_fingerprint char(64) not null,
  idempotency_key varchar(191) not null,
  request_hash char(64) not null,
  estimated_browser_seconds integer not null check (estimated_browser_seconds > 0),
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_capture_runs_workspace_id_id_idx
  on gideon_capture_runs (workspace_id, id);

create unique index if not exists gideon_capture_runs_workspace_idempotency_idx
  on gideon_capture_runs (workspace_id, idempotency_key);

create index if not exists gideon_capture_runs_project_created_idx
  on gideon_capture_runs (workspace_id, project_id, created_at desc);

create index if not exists gideon_capture_runs_status_updated_idx
  on gideon_capture_runs (status, updated_at);

create table if not exists gideon_flow_executions (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  capture_run_id text not null,
  flow_id text not null,
  flow_revision integer not null,
  environment_version_id text not null,
  status varchar(32) not null check (status in ('queued','running','verified','failed','blocked','canceled')),
  attempt integer not null check (attempt > 0),
  compiled_plan_hash char(64) not null,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists gideon_flow_executions_manifest_attempt_idx
  on gideon_flow_executions (workspace_id, capture_run_id, compiled_plan_hash, attempt);

create index if not exists gideon_flow_executions_flow_created_idx
  on gideon_flow_executions (workspace_id, flow_id, created_at desc);

create table if not exists gideon_coverage_snapshots (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  environment_version_id text not null,
  calculation_version varchar(80) not null,
  record_json jsonb not null,
  created_at timestamptz not null
);

create index if not exists gideon_coverage_snapshots_project_created_idx
  on gideon_coverage_snapshots (workspace_id, project_id, created_at desc);
