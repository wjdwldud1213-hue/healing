import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { employeeLeaveBalances, leaveGrants, leaveRequests } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { runLeaveAccrualBatch } from "../lib/leaveAccrual";
import { LeaveApprovalError, approveLeaveRequest, rejectLeaveRequest } from "../lib/leaveApproval";
import type { AppEnv } from "../types";

// 연차는 전부 "본인 것만" 다룬다 — 다른 직원 것은 이 라우트로 조회/신청할 수 없으므로
// 별도 권한 코드가 필요 없다(로그인만 하면 접근 가능, 마이페이지와 동일한 패턴).
export const leaveRoute = new Hono<AppEnv>();
leaveRoute.use("*", requireAuth);

leaveRoute.get("/balance", async (c) => {
  const employeeId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(employeeLeaveBalances)
    .where(eq(employeeLeaveBalances.employeeId, employeeId))
    .orderBy(desc(employeeLeaveBalances.year));
  return c.json(rows);
});

leaveRoute.get("/grants", async (c) => {
  const employeeId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(leaveGrants)
    .where(eq(leaveGrants.employeeId, employeeId))
    .orderBy(desc(leaveGrants.effectiveDate));
  return c.json(rows);
});

leaveRoute.get("/requests", async (c) => {
  const employeeId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.employeeId, employeeId))
    .orderBy(desc(leaveRequests.requestedAt));
  return c.json(rows);
});

leaveRoute.post("/requests", async (c) => {
  const employeeId = c.get("currentUserId")!;
  const body = await c.req
    .json<{ startDate?: string; endDate?: string; days?: number; reason?: string }>()
    .catch(() => ({}) as { startDate?: string; endDate?: string; days?: number; reason?: string });

  const startDate = (body.startDate ?? "").trim();
  const endDate = (body.endDate ?? "").trim();
  const days = body.days;

  if (!startDate || !endDate) return c.json({ error: "시작일과 종료일을 입력하세요." }, 400);
  if (endDate < startDate) return c.json({ error: "종료일은 시작일보다 빠를 수 없습니다." }, 400);
  if (days == null || days <= 0) return c.json({ error: "일수는 0보다 커야 합니다." }, 400);

  const db = getDb(c.env.DB);
  const [created] = await db
    .insert(leaveRequests)
    .values({
      employeeId,
      startDate,
      endDate,
      days,
      reason: body.reason || null,
      status: "PENDING",
    })
    .returning();

  return c.json(created, 201);
});

// 매일 자동으로 도는 배치(scheduled)와 동일한 로직을 관리자가 수동으로도 실행할 수 있게 해둔다.
// 로컬 개발 환경에서는 cron이 자동으로 발생하지 않으므로 이 엔드포인트로 직접 검증한다.
leaveRoute.post("/run-accrual", requirePermission("LEAVE_MANAGE"), async (c) => {
  const db = getDb(c.env.DB);
  const result = await runLeaveAccrualBatch(db);
  return c.json(result);
});

// ── 관리자 승인/반려 (지금은 관리자가 직접 처리, 나중에 결재 기능이 이 자리를 대체) ──
leaveRoute.get("/admin/requests", requirePermission("LEAVE_APPROVE"), async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.query.leaveRequests.findMany({
    where: eq(leaveRequests.status, "PENDING"),
    orderBy: (r, { asc }) => [asc(r.requestedAt)],
  });
  return c.json(rows);
});

leaveRoute.post("/admin/requests/:id/approve", requirePermission("LEAVE_APPROVE"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "잘못된 요청 ID입니다." }, 400);
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId");
  try {
    const updated = await approveLeaveRequest(db, id, actorId);
    return c.json(updated);
  } catch (e) {
    if (e instanceof LeaveApprovalError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

leaveRoute.post("/admin/requests/:id/reject", requirePermission("LEAVE_APPROVE"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "잘못된 요청 ID입니다." }, 400);
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId");
  try {
    const updated = await rejectLeaveRequest(db, id, actorId);
    return c.json(updated);
  } catch (e) {
    if (e instanceof LeaveApprovalError) return c.json({ error: e.message }, 400);
    throw e;
  }
});
