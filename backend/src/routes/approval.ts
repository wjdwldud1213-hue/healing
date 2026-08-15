import { Hono } from "hono";
import { and, eq, inArray, like } from "drizzle-orm";
import { getDb } from "../lib/db";
import { approvalDocuments, approvalSteps, departments, employees, jobGrades, leaveRequests } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import {
  ApprovalError,
  canViewDocument,
  cancelDocument,
  createApprovalDocument,
  isExecutiveViewer,
  rejectStep,
  approveStep,
} from "../lib/approval";
import { recommendDefaultApprovalLine } from "../lib/approvalLine";
import type { AppEnv } from "../types";

export const approvalRoute = new Hono<AppEnv>();
approvalRoute.use("*", requireAuth);

const documentDetail = {
  with: {
    drafter: { columns: { employeeId: true, name: true } },
    steps: {
      with: { approver: { columns: { employeeId: true, name: true } } },
    },
  },
} as const;

// documentDetail 자체에는 nested orderBy를 넣지 않는다(별도 const로 분리하면 drizzle이 콜백 인자
// 타입을 추론하지 못함) — 대신 조회 후 여기서 stepOrder 오름차순으로 정렬한다.
function withSortedSteps<T extends { steps: { stepOrder: number }[] }>(doc: T): T {
  return { ...doc, steps: [...doc.steps].sort((a, b) => a.stepOrder - b.stepOrder) };
}

function handleError(e: unknown): { message: string; status: 400 | 403 | 404 | 500 } {
  if (e instanceof ApprovalError) return { message: e.message, status: e.status };
  throw e;
}

// ── 기안 생성 ────────────────────────────────────────
approvalRoute.post("/documents", async (c) => {
  const drafterId = c.get("currentUserId")!;
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const documentType = body.documentType === "LEAVE" ? "LEAVE" : "GENERAL";
  const title = typeof body.title === "string" ? body.title : "";
  const content = typeof body.content === "string" ? body.content : null;
  const steps = Array.isArray(body.steps)
    ? (body.steps as { stepOrder?: number; approverId?: string }[])
        .filter((s) => Number.isInteger(s.stepOrder) && typeof s.approverId === "string")
        .map((s) => ({ stepOrder: s.stepOrder as number, approverId: s.approverId as string }))
    : [];
  const leave =
    documentType === "LEAVE" && body.leave && typeof body.leave === "object"
      ? (body.leave as { startDate?: string; endDate?: string; days?: number; reason?: string })
      : undefined;

  const db = getDb(c.env.DB);
  try {
    const doc = await createApprovalDocument(db, {
      drafterId,
      documentType,
      title,
      content,
      steps,
      leave: leave
        ? {
            startDate: (leave.startDate ?? "").trim(),
            endDate: (leave.endDate ?? "").trim(),
            days: leave.days ?? 0,
            reason: leave.reason || null,
          }
        : undefined,
    });
    return c.json(doc, 201);
  } catch (e) {
    const { message, status } = handleError(e);
    return c.json({ error: message }, status);
  }
});

// ── 기안함(내가 기안한 문서) ─────────────────────────────
approvalRoute.get("/documents/drafts", async (c) => {
  const db = getDb(c.env.DB);
  const drafterId = c.get("currentUserId")!;
  const rows = await db.query.approvalDocuments.findMany({
    where: eq(approvalDocuments.drafterId, drafterId),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    ...documentDetail,
  });
  return c.json(rows.map(withSortedSteps));
});

// ── 결재함(내가 결재자로 지정된 문서) ─────────────────────
approvalRoute.get("/documents/inbox", async (c) => {
  const db = getDb(c.env.DB);
  const approverId = c.get("currentUserId")!;
  const scope = c.req.query("scope") === "done" ? "done" : "pending";

  const steps = await db.query.approvalSteps.findMany({
    where: eq(approvalSteps.approverId, approverId),
    with: {
      document: {
        with: { drafter: { columns: { employeeId: true, name: true } } },
      },
    },
  });

  const filtered = steps.filter((s) => {
    if (scope === "pending") {
      return s.status === "PENDING" && s.document.status === "IN_PROGRESS" && s.document.currentStepOrder === s.stepOrder;
    }
    return s.status !== "PENDING";
  });

  return c.json(
    filtered
      .sort((a, b) => (a.document.createdAt < b.document.createdAt ? 1 : -1))
      .map((s) => ({
        documentId: s.document.id,
        documentType: s.document.documentType,
        title: s.document.title,
        documentStatus: s.document.status,
        drafter: s.document.drafter,
        stepOrder: s.stepOrder,
        stepStatus: s.status,
        createdAt: s.document.createdAt,
      })),
  );
});

// ── 전체 문서함(상무 이상 직급만) ─────────────────────────
approvalRoute.get("/documents/all", async (c) => {
  const db = getDb(c.env.DB);
  const viewerId = c.get("currentUserId")!;
  if (!(await isExecutiveViewer(db, viewerId))) {
    return c.json({ error: "전체 문서함은 상무 이상 직급만 조회할 수 있습니다." }, 403);
  }
  const rows = await db.query.approvalDocuments.findMany({
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    ...documentDetail,
  });
  return c.json(rows.map(withSortedSteps));
});

// ── 결재자 검색 (저권한 — 결재선 편집용) ───────────────────
approvalRoute.get("/approver-candidates", async (c) => {
  const db = getDb(c.env.DB);
  const q = (c.req.query("q") ?? "").trim();
  const conditions = [eq(employees.employmentStatus, "ACTIVE")];
  if (q) conditions.push(like(employees.name, `%${q}%`));

  const rows = await db
    .select({
      employeeId: employees.employeeId,
      name: employees.name,
      departmentName: departments.name,
      jobGradeName: jobGrades.name,
    })
    .from(employees)
    .innerJoin(departments, eq(employees.departmentId, departments.id))
    .innerJoin(jobGrades, eq(employees.jobGradeId, jobGrades.id))
    .where(and(...conditions))
    .limit(30);

  return c.json(rows);
});

// ── 추천 결재선 조회 ─────────────────────────────────────
approvalRoute.get("/recommend-line", async (c) => {
  const db = getDb(c.env.DB);
  const drafterId = c.get("currentUserId")!;
  const slots = await recommendDefaultApprovalLine(db, drafterId);
  if (slots.length === 0) return c.json([]);

  const details = await db
    .select({
      employeeId: employees.employeeId,
      name: employees.name,
      departmentName: departments.name,
      jobGradeName: jobGrades.name,
    })
    .from(employees)
    .innerJoin(departments, eq(employees.departmentId, departments.id))
    .innerJoin(jobGrades, eq(employees.jobGradeId, jobGrades.id))
    .where(
      inArray(
        employees.employeeId,
        slots.map((s) => s.approverId),
      ),
    );
  const detailById = new Map(details.map((d) => [d.employeeId, d]));

  return c.json(
    slots.map((s) => ({ stepOrder: s.stepOrder, approver: detailById.get(s.approverId) ?? null })),
  );
});

// ── 문서 상세 ────────────────────────────────────────
approvalRoute.get("/documents/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "잘못된 문서 ID입니다." }, 400);
  const db = getDb(c.env.DB);
  const viewerId = c.get("currentUserId")!;

  if (!(await canViewDocument(db, id, viewerId))) {
    return c.json({ error: "이 문서를 조회할 권한이 없습니다." }, 403);
  }

  const doc = await db.query.approvalDocuments.findFirst({
    where: eq(approvalDocuments.id, id),
    ...documentDetail,
  });
  if (!doc) return c.json({ error: "문서를 찾을 수 없습니다." }, 404);

  let leave = null;
  if (doc.documentType === "LEAVE") {
    leave = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.documentId, id) });
  }

  return c.json({ ...withSortedSteps(doc), leave });
});

// ── 승인/반려/취소 ───────────────────────────────────────
approvalRoute.post("/documents/:id/steps/:stepOrder/approve", async (c) => {
  const id = Number(c.req.param("id"));
  const stepOrder = Number(c.req.param("stepOrder"));
  if (!Number.isInteger(id) || !Number.isInteger(stepOrder)) {
    return c.json({ error: "잘못된 요청입니다." }, 400);
  }
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;
  const body = await c.req.json().catch(() => ({}) as { comment?: string });
  try {
    const result = await approveStep(db, id, stepOrder, actorId, body.comment ?? null);
    return c.json(result);
  } catch (e) {
    const { message, status } = handleError(e);
    return c.json({ error: message }, status);
  }
});

approvalRoute.post("/documents/:id/steps/:stepOrder/reject", async (c) => {
  const id = Number(c.req.param("id"));
  const stepOrder = Number(c.req.param("stepOrder"));
  if (!Number.isInteger(id) || !Number.isInteger(stepOrder)) {
    return c.json({ error: "잘못된 요청입니다." }, 400);
  }
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;
  const body = await c.req.json().catch(() => ({}) as { comment?: string });
  try {
    const result = await rejectStep(db, id, stepOrder, actorId, body.comment ?? null);
    return c.json(result);
  } catch (e) {
    const { message, status } = handleError(e);
    return c.json({ error: message }, status);
  }
});

approvalRoute.post("/documents/:id/cancel", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "잘못된 문서 ID입니다." }, 400);
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;
  try {
    const result = await cancelDocument(db, id, actorId);
    return c.json(result);
  } catch (e) {
    const { message, status } = handleError(e);
    return c.json({ error: message }, status);
  }
});
