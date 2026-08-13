import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import { employeeLeaveBalances, leaveRequests } from "../db/schema";

// 지금은 관리자가 화면에서 직접 승인/반려를 누르면 이 함수가 바로 호출된다.
// 나중에 결재(기안) 기능이 생기면, "결재 완료" 이벤트가 HTTP 라우트 대신 이 함수를
// 그대로 호출하도록 연결하면 된다 — 그래서 승인/반려 로직을 라우트 핸들러에서 분리해뒀다.
export class LeaveApprovalError extends Error {}

export async function approveLeaveRequest(db: Db, requestId: number, decidedBy: string | null) {
  const request = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, requestId) });
  if (!request) throw new LeaveApprovalError("신청을 찾을 수 없습니다.");
  if (request.status !== "PENDING") throw new LeaveApprovalError("이미 처리된 신청입니다.");

  const year = Number(request.startDate.slice(0, 4));
  const balance = await db.query.employeeLeaveBalances.findFirst({
    where: and(eq(employeeLeaveBalances.employeeId, request.employeeId), eq(employeeLeaveBalances.year, year)),
  });
  const remaining = balance ? balance.grantedDays + balance.carriedOverDays - balance.usedDays : 0;
  if (request.days > remaining) {
    throw new LeaveApprovalError(
      `잔여 연차(${remaining}일)보다 많은 일수(${request.days}일)를 승인할 수 없습니다.`,
    );
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(leaveRequests)
      .set({ status: "APPROVED", decidedBy, decidedAt: now })
      .where(eq(leaveRequests.id, requestId)),
    db
      .update(employeeLeaveBalances)
      .set({ usedDays: balance!.usedDays + request.days, updatedAt: now })
      .where(eq(employeeLeaveBalances.id, balance!.id)),
  ]);

  return { ...request, status: "APPROVED" as const, decidedBy, decidedAt: now };
}

export async function rejectLeaveRequest(db: Db, requestId: number, decidedBy: string | null) {
  const request = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, requestId) });
  if (!request) throw new LeaveApprovalError("신청을 찾을 수 없습니다.");
  if (request.status !== "PENDING") throw new LeaveApprovalError("이미 처리된 신청입니다.");

  const now = new Date().toISOString();
  await db
    .update(leaveRequests)
    .set({ status: "REJECTED", decidedBy, decidedAt: now })
    .where(eq(leaveRequests.id, requestId));

  return { ...request, status: "REJECTED" as const, decidedBy, decidedAt: now };
}
