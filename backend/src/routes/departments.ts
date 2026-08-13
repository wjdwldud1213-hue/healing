import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { departments, departmentCodeSequences } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import type { AppEnv } from "../types";

export const departmentsRoute = new Hono<AppEnv>();
departmentsRoute.use("*", requireAuth);

// 부서 목록 조회는 등록 화면 드롭다운 등에서 누구나 필요하므로 로그인만 요구한다.
// 추가/수정(코드 배정, 비활성화)은 DEPARTMENT_MANAGE 권한(시스템관리자)만 가능하다.
departmentsRoute.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(departments).orderBy(departments.sortOrder);
  return c.json(rows);
});

departmentsRoute.post("/", requirePermission("DEPARTMENT_MANAGE"), async (c) => {
  const body = await c.req
    .json<{ code?: string; name?: string; sortOrder?: number }>()
    .catch(() => ({}) as { code?: string; name?: string; sortOrder?: number });
  const code = (body.code ?? "").trim().toUpperCase();
  const name = (body.name ?? "").trim();

  if (!/^[A-Z]$/.test(code)) {
    return c.json({ error: "부서코드는 영문 A~Z 중 한 글자여야 합니다." }, 400);
  }
  if (!name) {
    return c.json({ error: "부서명을 입력하세요." }, 400);
  }

  const db = getDb(c.env.DB);
  // departments 행을 지우지 않고 is_active로만 관리하므로, 과거에 쓰였던
  // 코드까지 포함해 unique 제약이 곧 "미사용 코드만 배정 가능"을 보장한다.
  const existing = await db.query.departments.findFirst({ where: eq(departments.code, code) });
  if (existing) {
    return c.json({ error: `이미 사용 중이거나 과거에 사용된 부서코드입니다: ${code}` }, 409);
  }

  await db.batch([
    db.insert(departments).values({ code, name, sortOrder: body.sortOrder ?? 0 }),
    db.insert(departmentCodeSequences).values({ departmentCode: code, lastSeq: 0 }),
  ]);

  const created = await db.query.departments.findFirst({ where: eq(departments.code, code) });
  return c.json(created, 201);
});

departmentsRoute.patch("/:id", requirePermission("DEPARTMENT_MANAGE"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "잘못된 부서 ID입니다." }, 400);

  const body = await c.req
    .json<{ name?: string; isActive?: boolean; sortOrder?: number }>()
    .catch(() => ({}) as { name?: string; isActive?: boolean; sortOrder?: number });

  const db = getDb(c.env.DB);
  const updates: { name?: string; isActive?: boolean; sortOrder?: number; updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  await db.update(departments).set(updates).where(eq(departments.id, id));
  const updated = await db.query.departments.findFirst({ where: eq(departments.id, id) });
  if (!updated) return c.json({ error: "부서를 찾을 수 없습니다." }, 404);
  return c.json(updated);
});
