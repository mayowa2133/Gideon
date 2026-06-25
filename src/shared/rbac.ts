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

export function canManageWorkspaceRole(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  if (actorRole === "owner") {
    return true;
  }
  if (actorRole === "admin") {
    return targetRole !== "owner";
  }
  return false;
}

export function countWorkspaceOwners(members: WorkspaceMember[], workspaceId: string): number {
  return members.filter((member) => member.workspaceId === workspaceId && member.role === "owner").length;
}

export function assertCanManageWorkspaceRole(input: {
  actorRole: WorkspaceRole;
  targetRole: WorkspaceRole;
  action: "add" | "update" | "remove";
}): void {
  if (!canManageWorkspaceRole(input.actorRole, input.targetRole)) {
    throw new Error(`Workspace role ${input.actorRole} cannot ${input.action} ${input.targetRole} members.`);
  }
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
