import type { WorkspaceMember, WorkspaceRole } from "./types";

export type WorkspaceAction =
  | "project:read"
  | "project:create"
  | "project:update"
  | "project:delete"
  | "job:write"
  | "export:create"
  | "mcp:write"
  | "workspace:admin"
  | "billing:manage";

const rolePermissions: Record<WorkspaceRole, ReadonlySet<WorkspaceAction>> = {
  owner: new Set<WorkspaceAction>([
    "project:read",
    "project:create",
    "project:update",
    "project:delete",
    "job:write",
    "export:create",
    "mcp:write",
    "workspace:admin",
    "billing:manage"
  ]),
  admin: new Set<WorkspaceAction>([
    "project:read",
    "project:create",
    "project:update",
    "project:delete",
    "job:write",
    "export:create",
    "mcp:write",
    "workspace:admin",
    "billing:manage"
  ]),
  editor: new Set<WorkspaceAction>([
    "project:read",
    "project:create",
    "project:update",
    "job:write",
    "export:create",
    "mcp:write"
  ]),
  viewer: new Set<WorkspaceAction>(["project:read"])
};

export function roleAllows(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return rolePermissions[role].has(action);
}

export function findWorkspaceMembership(
  members: WorkspaceMember[],
  workspaceId: string,
  userId: string
): WorkspaceMember | null {
  return members.find((member) => member.workspaceId === workspaceId && member.userId === userId) ?? null;
}

export function assertWorkspacePermission(input: {
  members: WorkspaceMember[];
  workspaceId: string;
  userId: string | null | undefined;
  action: WorkspaceAction;
}): WorkspaceMember {
  if (!input.userId) {
    throw new Error("No active user is selected.");
  }
  const membership = findWorkspaceMembership(input.members, input.workspaceId, input.userId);
  if (!membership) {
    throw new Error("The active user is not a member of this workspace.");
  }
  if (!roleAllows(membership.role, input.action)) {
    throw new Error(`Workspace role ${membership.role} cannot perform ${input.action}.`);
  }
  return membership;
}
