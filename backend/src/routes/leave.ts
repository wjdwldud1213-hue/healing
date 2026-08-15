import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { employeeLeaveBalances, employees, leaveGrants, leaveRequests } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { getPermissionCodes } from "../lib/permissions";
import { runLeaveAccrualBatch } from "../lib/leaveAccrual";
import { ApprovalError, createApprovalDocument } from "../lib/approval";
import { recommendDefaultApprovalLine } from "../lib/approvalLine";
import type { Db } from "../lib/db";
import type { AppEnv } from "../types";

// 연차 신청/취소는 항상 "본인 것만" 다룬다. 조회(/balance, /requests)는 기본은 본인 것만이지만,
// employeeId 쿼리 파라미터로 다른 직원 것을 볼 수 있다 — ATTENDANCE_MANAGE 권한(근태내역조회 관리자용)이
// 있을 때만 허용하고, 없으면 파라미터를 무시하고 본인 것만 반환한다. attendance.ts의 /logs와 동일 패턴.
async function resolveTargetEmployeeId(db: Db, callerId: string, requested: string | undefined) {
  if (!requested || requested === callerId) return callerId;
  const caller = await db.query.employees.findFirst({ where: eq(employees.employeeId, callerId) });
  if (!caller) return callerId;
  const codes = await getPermissionCodes(db, caller.roleId);
  return codes.has("ATTENDANCE_MANAGE") ? requested : callerId;
}

export const leaveRoute = new Hono<AppEnv>();
leaveRoute.use("*", requireAuth);

leaveRoute.get("/balance", async (c) => {
  const db = getDb(c.env.DB);
  const employeeId = await resolveTargetEmployeeId(db, c.get("currentUserId")!, c.req.query("employeeId"));
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
  const db = getDb(c.env.DB);
  const employeeId = await resolveTargetEmployeeId(db, c.get("currentUserId")!, c.req.query("employeeId"));
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.employeeId, employeeId))
    .orderBy(desc(leaveRequests.startDate));
  return c.json(rows);
});

// 연차 신청은 전자결제 문서(documentType="LEAVE")의 한 종류로 생성된다. 결재선은
// recommendDefaultApprovalLine()이 자동으로 정하며(부서 최고직급자 → 물류부는 상무/그 외는 실장),
// 이번 1단계에서는 이 화면에 결재선을 직접 편집하는 UI가 없다 — 추천 결재선이 비면(예: 전사
// 최고직급자 본인이 신청하는 경우) 신청 자체가 막힌다는 뜻이며, 이는 알려진 범위 밖 제약이다.
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
  const steps = await recommendDefaultApprovalLine(db, employeeId);
  if (steps.length === 0) {
    return c.json(
      { error: "자동으로 결재선을 추천할 수 없습니다. 관리자에게 문의하세요." },
      400,
    );
  }

  try {
    const doc = await createApprovalDocument(db, {
      drafterId: employeeId,
      documentType: "LEAVE",
      title: `연차 신청 (${startDate}~${endDate})`,
      steps,
      leave: { startDate, endDate, days, reason: body.reason || null },
    });
    const created = await db.query.leaveRequests.findFirst({
      where: eq(leaveRequests.documentId, doc.id),
    });
    return c.json(created, 201);
  } catch (e) {
    if (e instanceof ApprovalError) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

// 매일 자동으로 도는 배치(scheduled)와 동일한 로직을 관리자가 수동으로도 실행할 수 있게 해둔다.
// 로컬 개발 환경에서는 cron이 자동으로 발생하지 않으므로 이 엔드포인트로 직접 검증한다.
leaveRoute.post("/run-accrual", requirePermission("LEAVE_MANAGE"), async (c) => {
  const db = getDb(c.env.DB);
  const result = await runLeaveAccrualBatch(db);
  return c.json(result);
});
