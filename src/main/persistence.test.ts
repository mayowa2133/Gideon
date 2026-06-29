import { describe, expect, it } from "vitest";
import { createLocalUserWorkspace } from "../shared/usage";
import type { AppState } from "../shared/types";
import {
  FileAppStatePersistence,
  PostgresSnapshotAppStatePersistence,
  quotePostgresIdentifier,
  type PostgresQuery
} from "./persistence";
import { GideonStore } from "./store";

function createState(): AppState {
  const local = createLocalUserWorkspace();
  return {
    ...local,
    usageEvents: [],
    auditEvents: [],
    activeUserId: local.users[0]?.id ?? null,
    activeWorkspaceId: local.workspaces[0]?.id ?? null,
    activeProjectId: null,
    projects: []
  };
}

describe("app state persistence", () => {
  it("lets GideonStore use an injected persistence backend", async () => {
    const savedStates: AppState[] = [];
    const persistence: FileAppStatePersistence = {
      metadata: { provider: "file", location: "memory" },
      async load() {
        return savedStates.at(-1) ?? null;
      },
      async save(state) {
        savedStates.push(JSON.parse(JSON.stringify(state)) as AppState);
      }
    };

    const store = new GideonStore({
      persistence,
      userDataDir: "/tmp/gideon-persistence-test"
    });

    const state = await store.load();

    expect(state.workspaces).toHaveLength(1);
    expect(savedStates).toHaveLength(1);
  });

  it("saves and loads state through the PostgreSQL snapshot adapter", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    let snapshot: AppState | null = null;
    const query: PostgresQuery = async (text, values) => {
      calls.push({ text, values });
      if (text.startsWith("select")) {
        return { rows: snapshot ? [{ state_json: snapshot }] : [] };
      }
      if (text.startsWith("insert")) {
        snapshot = JSON.parse(String(values?.[1])) as AppState;
      }
      return { rows: [] };
    };
    const persistence = new PostgresSnapshotAppStatePersistence({
      query,
      snapshotId: "tenant-default",
      tableName: "gideon_app_state_snapshots"
    });
    const state = createState();

    await persistence.save(state);
    const loaded = await persistence.load();

    expect(loaded?.workspaces[0]?.id).toBe(state.workspaces[0]?.id);
    expect(calls[0]?.text).toContain("create table if not exists \"gideon_app_state_snapshots\"");
    expect(calls.some((call) => call.text.includes("on conflict (id)"))).toBe(true);
    expect(calls.some((call) => call.text.includes("select state_json"))).toBe(true);
  });

  it("allows disabling PostgreSQL auto-migration for managed schema deployments", async () => {
    const calls: string[] = [];
    const persistence = new PostgresSnapshotAppStatePersistence({
      query: async (text) => {
        calls.push(text);
        return { rows: [] };
      },
      autoMigrate: false
    });

    await persistence.load();

    expect(calls).toEqual(['select state_json from "gideon_app_state_snapshots" where id = $1 limit 1']);
  });

  it("rejects unsafe PostgreSQL snapshot table identifiers", () => {
    expect(quotePostgresIdentifier("gideon_app_state_snapshots")).toBe('"gideon_app_state_snapshots"');
    expect(() => quotePostgresIdentifier("gideon; drop table projects")).toThrow(
      "Postgres snapshot table name must be a simple identifier."
    );
  });
});
