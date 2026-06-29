import fs from "node:fs/promises";
import path from "node:path";
import type { AppState } from "../shared/types";

export interface AppStatePersistenceMetadata {
  provider: "file" | "postgres_snapshot";
  location: string;
}

export interface AppStatePersistence {
  readonly metadata: AppStatePersistenceMetadata;
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
}

export class FileAppStatePersistence implements AppStatePersistence {
  readonly metadata: AppStatePersistenceMetadata;

  constructor(private readonly filePath: string) {
    this.metadata = {
      provider: "file",
      location: filePath
    };
  }

  async load(): Promise<AppState | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as AppState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async save(state: AppState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2));
    await fs.rename(temporaryPath, this.filePath);
  }
}

export interface PostgresQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
}

export type PostgresQuery = <Row = Record<string, unknown>>(
  text: string,
  values?: readonly unknown[]
) => Promise<PostgresQueryResult<Row>>;

export interface PostgresSnapshotPersistenceOptions {
  query: PostgresQuery;
  snapshotId?: string;
  tableName?: string;
  autoMigrate?: boolean;
}

interface AppStateSnapshotRow {
  state_json: unknown;
}

export class PostgresSnapshotAppStatePersistence implements AppStatePersistence {
  readonly metadata: AppStatePersistenceMetadata;
  private readonly query: PostgresQuery;
  private readonly snapshotId: string;
  private readonly tableName: string;
  private readonly autoMigrate: boolean;
  private schemaReady = false;

  constructor(options: PostgresSnapshotPersistenceOptions) {
    this.query = options.query;
    this.snapshotId = options.snapshotId?.trim() || "default";
    this.tableName = quotePostgresIdentifier(options.tableName?.trim() || "gideon_app_state_snapshots");
    this.autoMigrate = options.autoMigrate ?? true;
    this.metadata = {
      provider: "postgres_snapshot",
      location: `${this.tableName}:${this.snapshotId}`
    };
  }

  async load(): Promise<AppState | null> {
    await this.ensureSchema();
    const result = await this.query<AppStateSnapshotRow>(
      `select state_json from ${this.tableName} where id = $1 limit 1`,
      [this.snapshotId]
    );
    const state = result.rows[0]?.state_json;
    return state ? (state as AppState) : null;
  }

  async save(state: AppState): Promise<void> {
    await this.ensureSchema();
    await this.query(
      `insert into ${this.tableName} (id, state_json, schema_version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (id)
       do update set state_json = excluded.state_json, schema_version = excluded.schema_version, updated_at = now()`,
      [this.snapshotId, JSON.stringify(state)]
    );
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady || !this.autoMigrate) {
      return;
    }
    await this.query(
      `create table if not exists ${this.tableName} (
         id text primary key,
         state_json jsonb not null,
         schema_version integer not null default 1,
         updated_at timestamptz not null default now()
       )`
    );
    this.schemaReady = true;
  }
}

export function quotePostgresIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error("Postgres snapshot table name must be a simple identifier.");
  }
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}
