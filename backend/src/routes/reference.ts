import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { jobGrades, jobTitles } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import type { AppEnv } from "../types";

// 직급/직책은 부서와 마찬가지로 하드코딩하지 않고 코드 테이블로 관리한다.
// 체계가 바뀌어도 기존 직원 데이터가 깨지지 않도록 삭제 대신 is_active로 비활성화한다.
function referenceRoutes(table: typeof jobGrades | typeof jobTitles) {
  const route = new Hono<AppEnv>();
  route.use("*", requireAuth);

  // 조회는 등록 화면 드롭다운 등에서 누구나 필요하므로 로그인만 요구하고,
  // 추가/수정은 JOB_CODE_MANAGE 권한(시스템관리자)만 가능하다.
  route.get("/", async (c) => {
    const db = getDb(c.env.DB);
    const rows = await db.select().from(table).orderBy(table.sortOrder);
    return c.json(rows);
  });

  route.post("/", requirePermission("JOB_CODE_MANAGE"), async (c) => {
    const body = await c.req
      .json<{ name?: string; sortOrder?: number }>()
      .catch(() => ({}) as { name?: string; sortOrder?: number });
    const name = (body.name ?? "").trim();
    if (!name) return c.json({ error: "이름을 입력하세요." }, 400);

    const db = getDb(c.env.DB);
    const [created] = await db
      .insert(table)
      .values({ name, sortOrder: body.sortOrder ?? 0 })
      .returning();
    return c.json(created, 201);
  });

  route.patch("/:id", requirePermission("JOB_CODE_MANAGE"), async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "잘못된 ID입니다." }, 400);
    const body = await c.req
      .json<{ name?: string; sortOrder?: number; isActive?: boolean }>()
      .catch(() => ({}) as { name?: string; sortOrder?: number; isActive?: boolean });

    const db = getDb(c.env.DB);
    await db.update(table).set(body).where(eq(table.id, id));
    const updated = await db.select().from(table).where(eq(table.id, id)).get();
    if (!updated) return c.json({ error: "찾을 수 없습니다." }, 404);
    return c.json(updated);
  });

  return route;
}

export const jobGradesRoute = referenceRoutes(jobGrades);
export const jobTitlesRoute = referenceRoutes(jobTitles);
