import { and, eq, gt, ne } from "drizzle-orm";
import type { Db } from "./db";
import { employees, jobGrades } from "../db/schema";

// 정식 조직도(부서장/직속상사 지정)가 생기기 전까지, 이미 등록된 직급 서열과 고정 규칙으로
// 결재선을 추천한다. stepOrder는 항상 원래 슬롯 번호(1 또는 2)를 유지한다 — 기안자 본인이
// 부서 내 최고직급자라 1차가 생략되면 stepOrder=2(2차/최종) 슬롯 하나만 반환된다.
export type ApprovalLineSlot = { stepOrder: 1 | 2; approverId: string };

const LOGISTICS_DEPARTMENT_CODE = "C";

export async function recommendDefaultApprovalLine(
  db: Db,
  drafterId: string,
): Promise<ApprovalLineSlot[]> {
  const drafter = await db.query.employees.findFirst({
    where: eq(employees.employeeId, drafterId),
    with: { department: true, jobGrade: true },
  });
  if (!drafter || !drafter.jobGrade) return [];

  const slots: ApprovalLineSlot[] = [];

  // 1차: 같은 부서에서 본인을 제외하고 직급이 가장 높은 1명(동률이면 사번 오름차순).
  const deptCandidates = await db
    .select({ employeeId: employees.employeeId, sortOrder: jobGrades.sortOrder })
    .from(employees)
    .innerJoin(jobGrades, eq(employees.jobGradeId, jobGrades.id))
    .where(
      and(
        eq(employees.departmentId, drafter.departmentId),
        ne(employees.employeeId, drafterId),
        eq(employees.employmentStatus, "ACTIVE"),
        gt(jobGrades.sortOrder, drafter.jobGrade.sortOrder),
      ),
    );
  const firstApproverId = pickHighestSortOrder(deptCandidates)?.employeeId ?? null;

  // 2차(최종): 물류부 기안이면 전사의 '상무', 그 외 모든 부서는 전사의 '실장'(직급명 기준, 부서 무관).
  const finalGradeName = drafter.department?.code === LOGISTICS_DEPARTMENT_CODE ? "상무" : "실장";
  const finalCandidates = await db
    .select({ employeeId: employees.employeeId })
    .from(employees)
    .innerJoin(jobGrades, eq(employees.jobGradeId, jobGrades.id))
    .where(and(eq(jobGrades.name, finalGradeName), eq(employees.employmentStatus, "ACTIVE")));
  const finalApproverId = pickLowestEmployeeId(finalCandidates)?.employeeId ?? null;

  const secondApproverId = finalApproverId && finalApproverId !== drafterId ? finalApproverId : null;

  // 1차·2차 후보가 우연히 같은 사람이면(예: 부서 최고직급자가 마침 상무/실장 본인인 경우)
  // 같은 사람을 두 번 넣지 않고 2차(최종) 하나로 합친다.
  if (firstApproverId && firstApproverId === secondApproverId) {
    slots.push({ stepOrder: 2, approverId: secondApproverId });
    return slots;
  }

  if (firstApproverId) slots.push({ stepOrder: 1, approverId: firstApproverId });
  if (secondApproverId) slots.push({ stepOrder: 2, approverId: secondApproverId });
  return slots;
}

function pickHighestSortOrder<T extends { employeeId: string; sortOrder: number }>(
  candidates: T[],
): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (b.sortOrder !== a.sortOrder) return b.sortOrder - a.sortOrder;
    return a.employeeId < b.employeeId ? -1 : 1;
  })[0];
}

function pickLowestEmployeeId<T extends { employeeId: string }>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))[0];
}
