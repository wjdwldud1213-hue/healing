import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import { employeeLeaveBalances, leaveRequests } from "../db/schema";

// 연차 승인/반려는 전자결제 문서의 마지막 결재 단계가 승인/반려될 때 approval.ts에서 호출된다.
// "검증 + 쿼리 빌드"와 "실행"을 분리해둔 이유: 마지막 단계 승인 시 "단계 갱신 + 문서 갱신 + 연차 반영"을
// 하나의 db.batch()로 묶어야 "문서는 승인됐는데 잔액은 반영 안 됨" 같은 모순이 생기지 않기 때문이다.
// buildLeaveApprovalUpdates()는 검증만 하고 아직 아무것도 커밋하지 않는 update 구문만 반환한다.
export class LeaveApprovalError extends Error {}

export async function buildLeaveApprovalUpdates(db: Db, requestId: number, decidedBy: string | null) {
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
  const leaveRequestUpdate = db
    .update(leaveRequests)
    .set({ status: "APPROVED", decidedBy, decidedAt: now })
    .where(eq(leaveRequests.id, requestId));
  const balanceUpdate = db
    .update(employeeLeaveBalances)
    .set({ usedDays: balance!.usedDays + request.days, updatedAt: now })
    .where(eq(employeeLeaveBalances.id, balance!.id));

  return { leaveRequestUpdate, balanceUpdate, request, decidedAt: now };
}

// 단독 호출 경로(있다면)를 위한 하위호환 함수 — 검증부터 커밋까지 한 번에 처리한다.
export async function approveLeaveRequest(db: Db, requestId: number, decidedBy: string | null) {
  const { leaveRequestUpdate, balanceUpdate, request, decidedAt } = await buildLeaveApprovalUpdates(
    db,
    requestId,
    decidedBy,
  );
  await db.batch([leaveRequestUpdate, balanceUpdate]);
  return { ...request, status: "APPROVED" as const, decidedBy, decidedAt };
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
