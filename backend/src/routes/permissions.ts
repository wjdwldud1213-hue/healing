import { Hono } from "hono";
import { getDb } from "../lib/db";
import { permissions } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import type { AppEnv } from "../types";

// 권한 항목 카탈로그는 역할/권한 관리 화면(ROLE_MANAGE)에서만 필요하다.
export const permissionsRoute = new Hono<AppEnv>();
permissionsRoute.use("*", requireAuth);

permissionsRoute.get("/", requirePermission("ROLE_MANAGE"), async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(permissions).orderBy(permissions.category, permissions.code);
  return c.json(rows);
});
