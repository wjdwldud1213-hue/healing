import { and, eq, gt } from "drizzle-orm";
import type { Db } from "./db";
import { approvalDocuments, approvalSteps, employees, jobGrades, leaveRequests } from "../db/schema";
import { buildLeaveApprovalUpdates } from "./leaveApproval";

export class ApprovalError extends Error {
  status: 400 | 403 | 404;
  constructor(message: string, status: 400 | 403 | 404 = 400) {
    super(message);
    this.status = status;
  }
}

export type DraftStep = { stepOrder: number; approverId: string };

// 상무 이상 직급(상무/실장/대표)은 결재선에 없어도 모든 문서를 열람할 수 있다.
// "상무" 직급의 sortOrder를 기준값으로 삼아 그 이상인지 비교한다(하드코딩된 숫자 대신
// 직급명으로 조회해서, 나중에 직급 서열이 바뀌어도 이 로직이 따라간다).
export async function getExecutiveThresholdSortOrder(db: Db): Promise<number | null> {
  const [executiveGrade] = await db
    .select({ sortOrder: jobGrades.sortOrder })
    .from(jobGrades)
    .where(eq(jobGrades.name, "상무"));
  return executiveGrade?.sortOrder ?? null;
}

export async function isExecutiveViewer(db: Db, employeeId: string): Promise<boolean> {
  const [viewer] = await db
    .select({ sortOrder: jobGrades.sortOrder })
    .from(employees)
    .innerJoin(jobGrades, eq(employees.jobGradeId, jobGrades.id))
    .where(eq(employees.employeeId, employeeId));
  if (!viewer) return false;

  const threshold = await getExecutiveThresholdSortOrder(db);
  if (threshold == null) return false;

  return viewer.sortOrder >= threshold;
}

export async function canViewDocument(db: Db, documentId: number, viewerId: string): Promise<boolean> {
  const doc = await db.query.approvalDocuments.findFirst({ where: eq(approvalDocuments.id, documentId) });
  if (!doc) return false;
  if (doc.drafterId === viewerId) return true;

  const step = await db.query.approvalSteps.findFirst({
    where: and(eq(approvalSteps.documentId, documentId), eq(approvalSteps.approverId, viewerId)),
  });
  if (step) return true;

  return isExecutiveViewer(db, viewerId);
}

export async function createApprovalDocument(
  db: Db,
  input: {
    drafterId: string;
    documentType: "GENERAL" | "LEAVE";
    title: string;
    content?: string | null;
    steps: DraftStep[];
    leave?: { startDate: string; endDate: string; days: number; reason?: string | null };
  },
) {
  const title = input.title.trim();
  if (!title) throw new ApprovalError("제목을 입력하세요.");
  if (input.steps.length === 0) throw new ApprovalError("결재선을 1명 이상 지정하세요.");

  const orders = input.steps.map((s) => s.stepOrder);
  if (new Set(orders).size !== orders.length) {
    throw new ApprovalError("결재 순서가 중복되었습니다.");
  }
  if (input.steps.some((s) => s.approverId === input.drafterId)) {
    throw new ApprovalError("본인을 결재자로 지정할 수 없습니다.");
  }

  if (input.documentType === "LEAVE") {
    const leave = input.leave;
    if (!leave) throw new ApprovalError("연차 신청 정보가 없습니다.");
    if (!leave.startDate || !leave.endDate) throw new ApprovalError("시작일과 종료일을 입력하세요.");
    if (leave.endDate < leave.startDate) throw new ApprovalError("종료일은 시작일보다 빠를 수 없습니다.");
    if (!(leave.days > 0)) throw new ApprovalError("일수는 0보다 커야 합니다.");
  }

  const sortedSteps = [...input.steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const firstStepOrder = sortedSteps[0].stepOrder;

  // D1은 인터랙티브 트랜잭션이 없어 배치 중간에 만들어진 auto-increment id를 다음 statement에
  // 쓸 수 없다. 그래서 문서 헤더를 먼저 단독 insert하고, 그 id로 단계들을 batch insert한다.
  // 2단계가 실패하면(극히 드묾) orphan 문서를 보상 삭제로 정리한다 — 완전한 원자성은 아니지만
  // 실무적으로 충분히 안전하다.
  const [doc] = await db
    .insert(approvalDocuments)
    .values({
      documentType: input.documentType,
      title,
      content: input.content ?? null,
      drafterId: input.drafterId,
      status: "IN_PROGRESS",
      currentStepOrder: firstStepOrder,
    })
    .returning();

  try {
    const stepInserts = sortedSteps.map((s) =>
      db.insert(approvalSteps).values({
        documentId: doc.id,
        stepOrder: s.stepOrder,
        approverId: s.approverId,
        status: "PENDING",
      }),
    );
    const statements =
      input.documentType === "LEAVE"
        ? [
            ...stepInserts,
            db.insert(leaveRequests).values({
              employeeId: input.drafterId,
              startDate: input.leave!.startDate,
              endDate: input.leave!.endDate,
              days: input.leave!.days,
              reason: input.leave!.reason ?? null,
              status: "PENDING",
              documentId: doc.id,
            }),
          ]
        : stepInserts;
    // biome-ignore lint: drizzle의 배치 타입은 비어있지 않은 튜플을 요구하지만 길이가 동적이라 캐스팅한다.
    await db.batch(statements as any);
  } catch (e) {
    await db
      .delete(approvalDocuments)
      .where(eq(approvalDocuments.id, doc.id))
      .catch(() => {});
    throw e;
  }

  return doc;
}

async function loadDocumentWithStep(db: Db, documentId: number, stepOrder: number) {
  const doc = await db.query.approvalDocuments.findFirst({ where: eq(approvalDocuments.id, documentId) });
  if (!doc) throw new ApprovalError("문서를 찾을 수 없습니다.", 404);
  const step = await db.query.approvalSteps.findFirst({
    where: and(eq(approvalSteps.documentId, documentId), eq(approvalSteps.stepOrder, stepOrder)),
  });
  if (!step) throw new ApprovalError("결재 단계를 찾을 수 없습니다.", 404);
  return { doc, step };
}

export async function approveStep(
  db: Db,
  documentId: number,
  stepOrder: number,
  actorId: string,
  comment?: string | null,
) {
  const { doc, step } = await loadDocumentWithStep(db, documentId, stepOrder);
  if (doc.status !== "IN_PROGRESS") throw new ApprovalError("이미 종료된 문서입니다.");
  if (doc.currentStepOrder !== stepOrder || step.status !== "PENDING") {
    throw new ApprovalError("처리할 수 없는 단계입니다.");
  }
  if (step.approverId !== actorId) throw new ApprovalError("본인 차례가 아닙니다.", 403);

  const now = new Date().toISOString();
  // "다음 단계"는 항상 "현재보다 큰 stepOrder 중 가장 작은 값"으로 찾는다 — 1차가 생략된(2부터
  // 시작하는) 문서나, 3명 이상을 수동으로 편집한 문서 모두 이 로직 하나로 처리된다.
  const nextStep = await db.query.approvalSteps.findFirst({
    where: and(eq(approvalSteps.documentId, documentId), gt(approvalSteps.stepOrder, stepOrder)),
    orderBy: (s, { asc }) => [asc(s.stepOrder)],
  });
  const isLastStep = !nextStep;

  const statements: unknown[] = [
    db
      .update(approvalSteps)
      .set({ status: "APPROVED", comment: comment ?? null, decidedAt: now })
      .where(eq(approvalSteps.id, step.id)),
    db
      .update(approvalDocuments)
      .set({
        status: isLastStep ? "APPROVED" : "IN_PROGRESS",
        currentStepOrder: isLastStep ? stepOrder : nextStep!.stepOrder,
        updatedAt: now,
      })
      .where(eq(approvalDocuments.id, documentId)),
  ];

  if (isLastStep && doc.documentType === "LEAVE") {
    const leaveReq = await db.query.leaveRequests.findFirst({
      where: eq(leaveRequests.documentId, documentId),
    });
    if (!leaveReq) throw new ApprovalError("연결된 연차 신청을 찾을 수 없습니다.");
    // 잔액 부족 등 검증 실패는 여기서 throw되며, 이 시점까지는 아직 아무것도 커밋되지 않았다.
    const { leaveRequestUpdate, balanceUpdate } = await buildLeaveApprovalUpdates(db, leaveReq.id, actorId);
    statements.push(leaveRequestUpdate, balanceUpdate);
  }

  await db.batch(statements as any);
  const resultStatus: "APPROVED" | "IN_PROGRESS" = isLastStep ? "APPROVED" : "IN_PROGRESS";
  return { documentId, stepOrder, status: resultStatus };
}

export async function rejectStep(
  db: Db,
  documentId: number,
  stepOrder: number,
  actorId: string,
  comment?: string | null,
) {
  const { doc, step } = await loadDocumentWithStep(db, documentId, stepOrder);
  if (doc.status !== "IN_PROGRESS") throw new ApprovalError("이미 종료된 문서입니다.");
  if (doc.currentStepOrder !== stepOrder || step.status !== "PENDING") {
    throw new ApprovalError("처리할 수 없는 단계입니다.");
  }
  if (step.approverId !== actorId) throw new ApprovalError("본인 차례가 아닙니다.", 403);

  const now = new Date().toISOString();
  const statements: unknown[] = [
    db
      .update(approvalSteps)
      .set({ status: "REJECTED", comment: comment ?? null, decidedAt: now })
      .where(eq(approvalSteps.id, step.id)),
    db.update(approvalDocuments).set({ status: "REJECTED", updatedAt: now }).where(eq(approvalDocuments.id, documentId)),
  ];

  if (doc.documentType === "LEAVE") {
    const leaveReq = await db.query.leaveRequests.findFirst({
      where: eq(leaveRequests.documentId, documentId),
    });
    if (leaveReq) {
      statements.push(
        db
          .update(leaveRequests)
          .set({ status: "REJECTED", decidedBy: actorId, decidedAt: now })
          .where(eq(leaveRequests.id, leaveReq.id)),
      );
    }
  }

  await db.batch(statements as any);
  return { documentId, stepOrder, status: "REJECTED" as const };
}

export async function cancelDocument(db: Db, documentId: number, actorId: string) {
  const doc = await db.query.approvalDocuments.findFirst({ where: eq(approvalDocuments.id, documentId) });
  if (!doc) throw new ApprovalError("문서를 찾을 수 없습니다.", 404);
  if (doc.drafterId !== actorId) throw new ApprovalError("기안자만 취소할 수 있습니다.", 403);
  if (doc.status !== "IN_PROGRESS") throw new ApprovalError("이미 종료된 문서입니다.");

  const firstStep = await db.query.approvalSteps.findFirst({
    where: eq(approvalSteps.documentId, documentId),
    orderBy: (s, { asc }) => [asc(s.stepOrder)],
  });
  if (firstStep && firstStep.status !== "PENDING") {
    throw new ApprovalError("이미 결재가 진행되어 취소할 수 없습니다.");
  }

  const now = new Date().toISOString();
  const statements: unknown[] = [
    db
      .update(approvalDocuments)
      .set({ status: "CANCELED", updatedAt: now })
      .where(eq(approvalDocuments.id, documentId)),
  ];

  if (doc.documentType === "LEAVE") {
    const leaveReq = await db.query.leaveRequests.findFirst({
      where: eq(leaveRequests.documentId, documentId),
    });
    if (leaveReq) {
      statements.push(
        db
          .update(leaveRequests)
          .set({ status: "REJECTED", decidedBy: actorId, decidedAt: now })
          .where(eq(leaveRequests.id, leaveReq.id)),
      );
    }
  }

  await db.batch(statements as any);
  return { documentId, status: "CANCELED" as const };
}
