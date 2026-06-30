import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { PostgresQuery } from "./persistence";
import { PostgresCoreRepository } from "./postgresCoreRepository";
import type { Project, RecordingUploadSessionRecord, UserAccount, Workspace, WorkspaceMember } from "../shared/types";

const execFileAsync = promisify(execFile);

describe("PostgresCoreRepository", () => {
  it("upserts users into queryable identity columns while preserving the full record", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const user = userFixture();
    const repository = new PostgresCoreRepository(createQuery(calls, user));

    const saved = await repository.upsertUser(user);

    expect(saved.id).toBe("user-1");
    expect(calls[0]?.text).toContain("insert into gideon_users");
    expect(calls[0]?.text).toContain("on conflict (id) do update");
    expect(calls[0]?.values?.slice(0, 6)).toEqual([
      "user-1",
      "founder@example.com",
      "Founder",
      "google-oauth2|founder",
      "google",
      "2026-06-29T12:00:00.000Z"
    ]);
  });

  it("reads users by id and auth subject", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const user = userFixture();
    const repository = new PostgresCoreRepository(createQuery(calls, user));

    await repository.getUser({ userId: "user-1" });
    await repository.getUserByAuthSubject({
      identityProvider: "google",
      authSubject: "google-oauth2|founder"
    });
    await repository.getUserByAuthSubject({ authSubject: "local:local-user" });

    expect(calls[0]?.text).toContain("from gideon_users where id = $1");
    expect(calls[0]?.values).toEqual(["user-1"]);
    expect(calls[1]?.text).toContain("where identity_provider = $1 and auth_subject = $2");
    expect(calls[1]?.values).toEqual(["google", "google-oauth2|founder"]);
    expect(calls[2]?.text).toContain("where auth_subject = $1");
    expect(calls[2]?.values).toEqual(["local:local-user"]);
  });

  it("upserts workspaces with billing columns and entitlements JSON", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const workspace = workspaceFixture();
    const repository = new PostgresCoreRepository(createQuery(calls, workspace));

    const saved = await repository.upsertWorkspace(workspace);

    expect(saved.billingSubscriptionId).toBe("sub_123");
    expect(calls[0]?.text).toContain("insert into gideon_workspaces");
    expect(calls[0]?.values?.slice(0, 12)).toEqual([
      "workspace-1",
      "Acme",
      "acme",
      "team",
      "active",
      "stripe",
      "cus_123",
      "sub_123",
      "2026-07-29T12:00:00.000Z",
      false,
      "evt_123",
      JSON.stringify(workspace.entitlements)
    ]);
  });

  it("reads workspaces by id, slug, billing customer, and billing subscription", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const workspace = workspaceFixture();
    const repository = new PostgresCoreRepository(createQuery(calls, workspace));

    await repository.getWorkspace({ workspaceId: "workspace-1" });
    await repository.getWorkspaceBySlug({ slug: "acme" });
    await repository.getWorkspaceByBillingCustomer({ provider: "stripe", customerId: "cus_123" });
    await repository.getWorkspaceByBillingSubscription({ provider: "stripe", subscriptionId: "sub_123" });

    expect(calls[0]?.text).toContain("from gideon_workspaces where id = $1");
    expect(calls[0]?.values).toEqual(["workspace-1"]);
    expect(calls[1]?.text).toContain("from gideon_workspaces where slug = $1");
    expect(calls[1]?.values).toEqual(["acme"]);
    expect(calls[2]?.text).toContain("where billing_provider = $1 and billing_customer_id = $2");
    expect(calls[2]?.values).toEqual(["stripe", "cus_123"]);
    expect(calls[3]?.text).toContain("where billing_provider = $1 and billing_subscription_id = $2");
    expect(calls[3]?.values).toEqual(["stripe", "sub_123"]);
  });

  it("lists workspaces available to a user through workspace membership", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const workspace = workspaceFixture();
    const repository = new PostgresCoreRepository(createQuery(calls, workspace));

    const workspaces = await repository.listUserWorkspaces({ userId: "user-1", limit: 500 });

    expect(workspaces).toEqual([workspace]);
    expect(calls[0]?.text).toContain("inner join gideon_workspace_members");
    expect(calls[0]?.text).toContain("where m.user_id = $1");
    expect(calls[0]?.values).toEqual(["user-1", 200]);
  });

  it("upserts workspace members, projects, and upload sessions", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const member = memberFixture();
    const project = projectFixture();
    const session = uploadSessionFixture();
    const repository = new PostgresCoreRepository(createQuery(calls, member));

    await repository.upsertWorkspaceMember(member);
    await new PostgresCoreRepository(createQuery(calls, project)).upsertProject(project);
    await new PostgresCoreRepository(createQuery(calls, session)).upsertRecordingUploadSession(session);

    expect(calls[0]?.text).toContain("insert into gideon_workspace_members");
    expect(calls[0]?.values?.slice(0, 4)).toEqual(["member-1", "workspace-1", "user-1", "owner"]);
    expect(calls[1]?.text).toContain("insert into gideon_projects");
    expect(calls[1]?.values?.slice(0, 10)).toEqual([
      "project-1",
      "workspace-1",
      "Launch demo",
      "recording_ready",
      JSON.stringify(project.profile),
      "source-artifact-1",
      "private/workspace-1/project-1/source.mov",
      "completed",
      "The walkthrough shows onboarding.",
      1
    ]);
    expect(calls[2]?.text).toContain("insert into gideon_recording_upload_sessions");
    expect(calls[2]?.values?.slice(0, 7)).toEqual([
      "upload-1",
      "workspace-1",
      "project-1",
      "source-artifact-1",
      "r2",
      "private/workspace-1/project-1/source.mov",
      "completed"
    ]);
  });

  it("reads workspace membership by scoped user and lists workspace members", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const member = memberFixture();
    const repository = new PostgresCoreRepository(createQuery(calls, member));

    await repository.getWorkspaceMember({ workspaceId: "workspace-1", userId: "user-1" });
    await repository.listWorkspaceMembers({ workspaceId: "workspace-1", limit: 999 });

    expect(calls[0]?.text).toContain("where workspace_id = $1 and user_id = $2");
    expect(calls[0]?.values).toEqual(["workspace-1", "user-1"]);
    expect(calls[1]?.text).toContain("from gideon_workspace_members");
    expect(calls[1]?.values).toEqual(["workspace-1", 200]);
  });

  it("lists projects by workspace, optional status, and clamped limit", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const project = projectFixture();
    const repository = new PostgresCoreRepository(createQuery(calls, project));

    const projects = await repository.listWorkspaceProjects({
      workspaceId: "workspace-1",
      status: "recording_ready",
      limit: 999
    });

    expect(projects).toEqual([project]);
    expect(calls[0]?.text).toContain("where workspace_id = $1 and status = $2");
    expect(calls[0]?.values).toEqual(["workspace-1", "recording_ready", 200]);
  });

  it("adds core identity/project tables to the migration runner", async () => {
    const migrationPath = path.join(process.cwd(), "migrations/0003_core_identity_projects.sql");
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists gideon_users");
    expect(migration).toContain("create table if not exists gideon_workspaces");
    expect(migration).toContain("create table if not exists gideon_projects");
    expect(migration).toContain("create table if not exists gideon_recording_upload_sessions");
    expect(migration).toContain("record_json jsonb not null");

    const result = await execFileAsync(process.execPath, ["scripts/migrate-postgres.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });
    expect(result.stdout).toContain("DRY_RUN 0003_core_identity_projects.sql");
  });
});

function createQuery<T>(
  calls: Array<{ text: string; values?: readonly unknown[] }>,
  record: T
): PostgresQuery {
  return async (text, values) => {
    calls.push({ text, values });
    return { rows: [{ record_json: record }] };
  };
}

function userFixture(): UserAccount {
  return {
    id: "user-1",
    email: "founder@example.com",
    displayName: "Founder",
    authSubject: "google-oauth2|founder",
    identityProvider: "google",
    lastSignedInAt: "2026-06-29T12:00:00.000Z",
    createdAt: "2026-06-29T11:00:00.000Z"
  };
}

function workspaceFixture(): Workspace {
  return {
    id: "workspace-1",
    name: "Acme",
    slug: "acme",
    plan: "team",
    billingStatus: "active",
    billingProvider: "stripe",
    billingCustomerId: "cus_123",
    billingSubscriptionId: "sub_123",
    billingCurrentPeriodEnd: "2026-07-29T12:00:00.000Z",
    billingCancelAtPeriodEnd: false,
    billingLastEventId: "evt_123",
    entitlements: {
      sourceMinutesMonthly: 120,
      transcriptionMinutesMonthly: 120,
      llmRunsMonthly: 500,
      ttsCharactersMonthly: 200_000,
      renderMinutesMonthly: 120,
      storageBytes: 50_000_000_000,
      exportsMonthly: 200,
      maxProjects: 50
    },
    createdAt: "2026-06-29T11:00:00.000Z",
    updatedAt: "2026-06-29T12:00:00.000Z"
  };
}

function memberFixture(): WorkspaceMember {
  return {
    id: "member-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    role: "owner",
    createdAt: "2026-06-29T11:00:00.000Z",
    updatedAt: "2026-06-29T12:00:00.000Z"
  };
}

function projectFixture(): Project {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    name: "Launch demo",
    status: "recording_ready",
    profile: {
      productName: "Gideon",
      targetCustomer: "SaaS founders",
      productDescription: "Turns walkthroughs into short-form marketing videos.",
      preferredTone: "direct",
      toneGuidance: "Specific and useful.",
      platforms: ["linkedin"],
      walkthroughNotes: "Show upload to export."
    },
    recording: {
      filePath: "/cache/source.mov",
      fileUrl: "file:///cache/source.mov",
      fileName: "source.mov",
      artifactId: "source-artifact-1",
      storageKey: "private/workspace-1/project-1/source.mov",
      sizeBytes: 1000,
      durationMs: 30_000,
      width: 1280,
      height: 720,
      fps: 30,
      videoCodec: "h264",
      audioCodec: "aac",
      hasAudio: true,
      validatedAt: "2026-06-29T12:00:00.000Z"
    },
    transcript: {
      id: "transcript-1",
      status: "completed",
      provider: "openai",
      model: "gpt-4o-transcribe",
      text: "This walkthrough shows onboarding.",
      segments: [],
      createdAt: "2026-06-29T12:00:00.000Z"
    },
    analysisSummary: "The walkthrough shows onboarding.",
    frameEvidence: [],
    moments: [
      {
        id: "moment-1",
        label: "Onboarding",
        startMs: 0,
        endMs: 3000,
        evidence: "Transcript evidence.",
        confidence: 0.9,
        enabled: true
      }
    ],
    concepts: [],
    scripts: [],
    renders: [],
    artifacts: [],
    uploadSessions: [uploadSessionFixture()],
    providerRuns: [],
    jobs: [],
    jobEvents: [],
    createdAt: "2026-06-29T11:00:00.000Z",
    updatedAt: "2026-06-29T12:00:00.000Z"
  };
}

function uploadSessionFixture(): RecordingUploadSessionRecord {
  return {
    id: "upload-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    artifactId: "source-artifact-1",
    provider: "r2",
    storageKey: "private/workspace-1/project-1/source.mov",
    status: "completed",
    method: "PUT",
    contentType: "video/quicktime",
    byteSize: 1000,
    originalFileName: "source.mov",
    expiresAt: "2026-06-29T12:15:00.000Z",
    createdAt: "2026-06-29T12:00:00.000Z",
    updatedAt: "2026-06-29T12:01:00.000Z"
  };
}
