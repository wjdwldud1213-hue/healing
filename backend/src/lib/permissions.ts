import { eq } from "drizzle-orm";
import { permissions, rolePermissions } from "../db/schema";
import type { Db } from "./db";

export async function getPermissionCodes(db: Db, roleId: number): Promise<Set<string>> {
  const rows = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
  return new Set(rows.map((r) => r.code));
}
