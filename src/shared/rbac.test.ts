import { describe, expect, it } from "vitest";
import { assertCanManageWorkspaceRole, assertWorkspacePermission, canManageWorkspaceRole, countWorkspaceOwners, roleAllows } from "./rbac";
import type { WorkspaceMember, WorkspaceRole } from "./types";

describe("workspace RBAC", () => {
  it("allows owners and admins to administer and delete projects", () => {
    expect(roleAllows("owner", "workspace:admin")).toBe(true);
    expect(roleAllows("admin", "project:delete")).toBe(true);
    expect(roleAllows("admin", "billing:manage")).toBe(true);
  });

  it("allows editors to mutate projects and MCP edits without administration rights", () => {
    expect(roleAllows("editor", "project:update")).toBe(true);
    expect(roleAllows("editor", "mcp:write")).toBe(true);
    expect(roleAllows("editor", "project:delete")).toBe(false);
    expect(roleAllows("editor", "billing:manage")).toBe(false);
  });

  it("limits viewers to read-only project access", () => {
    expect(roleAllows("viewer", "project:read")).toBe(true);
    expect(roleAllows("viewer", "project:update")).toBe(false);
    expect(roleAllows("viewer", "mcp:write")).toBe(false);
  });

  it("throws when a user is missing or lacks the required role", () => {
    const members = [member("viewer")];
    expect(() =>
      assertWorkspacePermission({ members, workspaceId: "workspace-1", userId: "user-1", action: "project:read" })
    ).not.toThrow();
    expect(() =>
      assertWorkspacePermission({ members, workspaceId: "workspace-1", userId: "user-1", action: "project:update" })
    ).toThrow("cannot perform");
    expect(() =>
      assertWorkspacePermission({ members, workspaceId: "workspace-1", userId: "user-2", action: "project:read" })
    ).toThrow("not a member");
    expect(() =>
      assertWorkspacePermission({ members, workspaceId: "workspace-1", userId: null, action: "project:read" })
    ).toThrow("No active user");
  });

  it("allows only owners to manage owner-level membership", () => {
    expect(canManageWorkspaceRole("owner", "owner")).toBe(true);
    expect(canManageWorkspaceRole("admin", "editor")).toBe(true);
    expect(canManageWorkspaceRole("admin", "owner")).toBe(false);
    expect(canManageWorkspaceRole("editor", "viewer")).toBe(false);
    expect(() => assertCanManageWorkspaceRole({ actorRole: "admin", targetRole: "owner", action: "add" })).toThrow(
      "cannot add owner"
    );
  });

  it("counts workspace owners for last-owner safeguards", () => {
    expect(countWorkspaceOwners([member("owner"), member("admin"), { ...member("owner"), id: "member-owner-2", userId: "user-2" }], "workspace-1")).toBe(2);
  });
});

function member(role: WorkspaceRole): WorkspaceMember {
  return {
    id: `member-${role}`,
    workspaceId: "workspace-1",
    userId: "user-1",
    role,
    createdAt: "2026-06-25T00:00:00.000Z"
  };
}
