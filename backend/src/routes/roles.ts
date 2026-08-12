import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { roles, rolePermissions } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import type { AppEnv } from "../types";

export const rolesRoute = new Hono<AppEnv>();
rolesRoute.use("*", requireAuth);

// 역할 이름 목록은 직원 등록 화면의 드롭다운 등에서 누구나 필요하므로 로그인만 요구한다.
// 역할 추가/수정과 권한 매핑 변경은 ROLE_MANAGE 권한(시스템관리자)만 가능하다.
rolesRoute.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(roles).orderBy(roles.name);
  return c.json(rows);
});

rolesRoute.post("/", requirePermission("ROLE_MANAGE"), async (c) => {
  const body = await c.req
    .json<{ name?: string; description?: string }>()
    .catch(() => ({}) as { name?: string; description?: string });
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ error: "역할 이름을 입력하세요." }, 400);

  const db = getDb(c.env.DB);
  const existing = await db.query.roles.findFirst({ where: eq(roles.name, name) });
  if (existing) return c.json({ error: `이미 있는 역할 이름입니다: ${name}` }, 409);

  const [created] = await db
    .insert(roles)
    .values({ name, description: body.description ?? null })
    .returning();
  return c.json(created, 201);
});

rolesRoute.patch("/:id", requirePermission("ROLE_MANAGE"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "잘못된 역할 ID입니다." }, 400);
  const body = await c.req
    .json<{ name?: string; description?: string; isActive?: boolean }>()
    .catch(() => ({}) as { name?: string; description?: string; isActive?: boolean });

  const db = getDb(c.env.DB);
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  await db.update(roles).set(updates).where(eq(roles.id, id));
  const updated = await db.query.roles.findFirst({ where: eq(roles.id, id) });
  if (!updated) return c.json({ error: "역할을 찾을 수 없습니다." }, 404);
  return c.json(updated);
});

// 역할별 권한 매핑 — 관리자 화면의 체크박스 매트릭스가 이 두 엔드포인트로 조회/저장한다.
rolesRoute.get("/:id/permissions", requirePermission("ROLE_MANAGE"), async (c) => {
  const roleId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
  return c.json(rows.map((r) => r.permissionId));
});

rolesRoute.put("/:id/permissions", requirePermission("ROLE_MANAGE"), async (c) => {
  const roleId = Number(c.req.param("id"));
  const body = await c.req
    .json<{ permissionIds?: number[] }>()
    .catch(() => ({}) as { permissionIds?: number[] });
  const permissionIds = [...new Set(body.permissionIds ?? [])];
  const actorId = c.get("currentUserId");

  const db = getDb(c.env.DB);
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (permissionIds.length > 0) {
    await db
      .insert(rolePermissions)
      .values(permissionIds.map((permissionId) => ({ roleId, permissionId, grantedBy: actorId })));
  }
  return c.json({ ok: true });
});
