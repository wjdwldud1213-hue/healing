import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../lib/db";
import { generateEmployeeId, generateTempPassword } from "../lib/employeeId";
import { getPermissionCodes } from "../lib/permissions";
import { accrueLeaveForNewEmployee, grantLeave } from "../lib/leaveAccrual";
import {
  departments,
  employeeAssignmentHistory,
  employeeCompensations,
  employeeLeaveBalances,
  employees,
  leaveGrants,
  jobGrades,
  jobTitles,
  roles,
} from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import type { AppEnv } from "../types";

export const employeesRoute = new Hono<AppEnv>();
employeesRoute.use("*", requireAuth);

const employeeDetail = {
  with: {
    department: true,
    jobGrade: true,
    jobTitle: true,
    role: true,
  },
} as const;

// 이름/부서/직급/직군/내선번호를 제외한 나머지는 개인정보로 보고 기본적으로 가린다.
// EMPLOYEE_WRITE 권한이 없는 조회자에게는 목록/상세 응답에서 이 필드들을 null로 비운 뒤,
// 해당 직원의 조회용 비밀번호(PIN)를 맞혀야만(POST /:id/unlock) 실제 값을 내려준다.
const SENSITIVE_FIELDS = [
  "hireDate",
  "employmentStatus",
  "statusChangedAt",
  "jobTitleId",
  "jobTitle",
  "mobilePhone",
  "address",
  "employmentType",
  "isOwnerOperator",
  "roleId",
  "role",
] as const;

function maskSensitiveFields<T extends Record<string, unknown>>(emp: T): T {
  const masked = { ...emp };
  for (const key of SENSITIVE_FIELDS) {
    if (key in masked) (masked as Record<string, unknown>)[key] = null;
  }
  return masked;
}

function stripPrivateFields<T extends { passwordHash?: unknown; viewPinHash?: unknown }>(emp: T) {
  const { passwordHash: _passwordHash, viewPinHash: _viewPinHash, ...rest } = emp;
  return rest;
}

// "직원 관리" 화면은 EMPLOYEE_WRITE(관리자) 전용이라 프론트 라우트 자체가 막혀 있지만, 이
// 목록 API는 조직도처럼 전 직원에게 열린 화면에서도 같이 쓴다. EMPLOYEE_READ_ALL(관리자급)만
// 부서 제한 없이 전체를 보고, 그 외(부서관리자 포함 — 더 이상 부서 단위 특례를 주지 않는다)는
// 마스킹(아래 canSeeAll)으로 개인정보만 가려서 전사 조회만 가능하다.
employeesRoute.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;
  const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
  if (!actor) return c.json({ error: "로그인이 필요합니다." }, 401);
  const codes = await getPermissionCodes(db, actor.roleId);

  const departmentId = c.req.query("departmentId");
  const status = c.req.query("status");
  const conditions = [];
  if (departmentId) conditions.push(eq(employees.departmentId, Number(departmentId)));
  if (status) conditions.push(eq(employees.employmentStatus, status as "ACTIVE" | "LEAVE" | "RESIGNED"));

  if (codes.has("EMPLOYEE_READ_ALL")) {
    // 제한 없음
  } else if (!status) {
    // 마스킹 대상 조회자는 employmentStatus를 못 보므로(null), 퇴사자 제외를 클라이언트가
    // 판단할 수 없다 — 서버가 기본적으로 퇴사자를 응답에서 제외한다(조직도 등 전사 조회용).
    conditions.push(ne(employees.employmentStatus, "RESIGNED"));
  }

  const rows = await db.query.employees.findMany({
    ...employeeDetail,
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: (e, { asc }) => [asc(e.employeeId)],
  });

  const canSeeAll = codes.has("EMPLOYEE_WRITE");
  return c.json(
    rows.map((row) => {
      const stripped = stripPrivateFields(row);
      return canSeeAll ? stripped : maskSensitiveFields(stripped);
    }),
  );
});

employeesRoute.get("/:id", async (c) => {
  const targetId = c.req.param("id");
  const actorId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);

  const target = await db.query.employees.findFirst({
    ...employeeDetail,
    where: eq(employees.employeeId, targetId),
  });
  if (!target) return c.json({ error: "직원을 찾을 수 없습니다." }, 404);

  const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
  const codes = await getPermissionCodes(db, actor!.roleId);

  if (targetId !== actorId) {
    const allowed =
      codes.has("EMPLOYEE_READ_ALL") ||
      (codes.has("EMPLOYEE_READ_DEPARTMENT") && target.departmentId === actor!.departmentId);
    if (!allowed) return c.json({ error: "조회 권한이 없습니다." }, 403);
  }

  const stripped = stripPrivateFields(target);
  return c.json(codes.has("EMPLOYEE_WRITE") ? stripped : maskSensitiveFields(stripped));
});

// 해당 직원의 조회용 비밀번호(PIN)를 맞히면, 마스킹 없는 전체 정보를 그 자리에서 돌려준다.
// EMPLOYEE_WRITE 권한자는 애초에 마스킹이 안 되므로 이 엔드포인트를 쓸 필요가 없다.
employeesRoute.post("/:id/unlock", async (c) => {
  const targetId = c.req.param("id");
  const actorId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);

  const target = await db.query.employees.findFirst({
    ...employeeDetail,
    where: eq(employees.employeeId, targetId),
  });
  if (!target) return c.json({ error: "직원을 찾을 수 없습니다." }, 404);

  if (targetId !== actorId) {
    const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
    const codes = await getPermissionCodes(db, actor!.roleId);
    const allowed =
      codes.has("EMPLOYEE_WRITE") ||
      codes.has("EMPLOYEE_READ_ALL") ||
      (codes.has("EMPLOYEE_READ_DEPARTMENT") && target.departmentId === actor!.departmentId);
    if (!allowed) return c.json({ error: "조회 권한이 없습니다." }, 403);
  }

  if (!target.viewPinHash) {
    return c.json({ error: "이 직원은 아직 조회용 비밀번호를 설정하지 않았습니다." }, 400);
  }

  const body = await c.req.json<{ pin?: string }>().catch(() => ({}) as { pin?: string });
  const pin = (body.pin ?? "").trim();
  if (!pin) return c.json({ error: "조회용 비밀번호를 입력하세요." }, 400);

  const ok = await bcrypt.compare(pin, target.viewPinHash);
  if (!ok) return c.json({ error: "조회용 비밀번호가 올바르지 않습니다." }, 400);

  return c.json(stripPrivateFields(target));
});

// 본인만 자신의 조회용 비밀번호(PIN)를 설정/변경할 수 있다.
// 세션만 있으면(로그인 비밀번호 확인 없이) 조회용 비밀번호를 마음대로 바꿔버릴 수 있으면
// PIN이 "2차 잠금"으로서 의미가 없다(자리 비운 사이 세션을 도용당한 경우 등) — 그래서
// 로그인 비밀번호를 다시 입력받아 확인한 뒤에만 PIN을 설정/변경할 수 있게 한다.
employeesRoute.post("/:id/set-view-pin", async (c) => {
  const targetId = c.req.param("id");
  const actorId = c.get("currentUserId")!;
  if (targetId !== actorId) {
    return c.json({ error: "본인만 조회용 비밀번호를 설정할 수 있습니다." }, 403);
  }

  const body = await c.req
    .json<{ pin?: string; currentPassword?: string }>()
    .catch(() => ({}) as { pin?: string; currentPassword?: string });
  const pin = (body.pin ?? "").trim();
  if (!/^\d{4,}$/.test(pin)) {
    return c.json({ error: "조회용 비밀번호는 숫자 4자리 이상이어야 합니다." }, 400);
  }

  const db = getDb(c.env.DB);
  const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
  const passwordOk =
    typeof body.currentPassword === "string" &&
    (await bcrypt.compare(body.currentPassword, actor!.passwordHash));
  if (!passwordOk) {
    return c.json({ error: "현재 로그인 비밀번호가 일치하지 않습니다." }, 403);
  }

  const viewPinHash = await bcrypt.hash(pin, 10);
  await db
    .update(employees)
    .set({ viewPinHash, updatedAt: new Date().toISOString() })
    .where(eq(employees.employeeId, targetId));

  return c.json({ ok: true });
});

// 직원 수정 화면(관리자)과 마이페이지 본인 PIN 잠금해제(본인)에서 급여/연차일수를 보여주기
// 위한 현재값 조회. 급여는 가장 최근 이력, 연차는 올해 employee_leave_balances 집계
// (자동발생 배치가 입사일 기준으로 이미 계산해둔 값)를 그대로 내려준다 — 그래서 관리자가
// 직접 입력하지 않아도 입사일 기준 계산값이 노출된다.
employeesRoute.get("/:id/compensation-leave-summary", async (c) => {
  const targetId = c.req.param("id");
  const actorId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);

  if (targetId !== actorId) {
    const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
    const codes = await getPermissionCodes(db, actor!.roleId);
    if (!codes.has("EMPLOYEE_WRITE")) return c.json({ error: "조회 권한이 없습니다." }, 403);
  }

  const currentYear = new Date().getFullYear();

  const latestCompensation = await db.query.employeeCompensations.findFirst({
    where: eq(employeeCompensations.employeeId, targetId),
    orderBy: (comp, { desc }) => [desc(comp.effectiveDate), desc(comp.id)],
  });
  const currentYearBalance = await db.query.employeeLeaveBalances.findFirst({
    where: and(eq(employeeLeaveBalances.employeeId, targetId), eq(employeeLeaveBalances.year, currentYear)),
  });

  return c.json({
    currentSalary: latestCompensation?.baseSalary ?? null,
    currentYearGrantedDays: currentYearBalance?.grantedDays ?? 0,
    currentYear,
  });
});

employeesRoute.post("/", requirePermission("EMPLOYEE_WRITE"), async (c) => {
  const body = await c.req
    .json<{
      name?: string;
      departmentId?: number;
      jobGradeId?: number;
      jobTitleId?: number | null;
      hireDate?: string;
      mobilePhone?: string;
      extensionNumber?: string | null;
      roleId?: number;
      address?: string | null;
      baseSalary?: number;
      initialLeaveDays?: number;
      employmentStatus?: string;
      jobType?: string;
      employmentType?: string;
      isOwnerOperator?: boolean | null;
    }>()
    .catch(() => ({}) as Record<string, never>);

  const name = (body.name ?? "").trim();
  const hireDate = (body.hireDate ?? "").trim();
  const mobilePhone = (body.mobilePhone ?? "").trim();
  const {
    departmentId,
    jobGradeId,
    jobTitleId,
    roleId,
    extensionNumber,
    address,
    baseSalary,
    initialLeaveDays,
    employmentStatus,
  } = body;

  if (!name) return c.json({ error: "이름을 입력하세요." }, 400);
  if (!departmentId) return c.json({ error: "부서를 선택하세요." }, 400);
  if (!jobGradeId) return c.json({ error: "직급을 선택하세요." }, 400);
  if (!hireDate) return c.json({ error: "입사일을 입력하세요." }, 400);
  if (!mobilePhone) return c.json({ error: "휴대폰번호를 입력하세요." }, 400);
  if (!roleId) return c.json({ error: "역할(권한)을 선택하세요." }, 400);
  if (baseSalary != null && baseSalary < 0) return c.json({ error: "급여는 0 이상이어야 합니다." }, 400);
  if (initialLeaveDays != null && initialLeaveDays < 0)
    return c.json({ error: "연차일수는 0 이상이어야 합니다." }, 400);
  if (employmentStatus != null && employmentStatus !== "ACTIVE" && employmentStatus !== "LEAVE") {
    return c.json({ error: "등록 시 재직상태는 재직 또는 휴직만 선택할 수 있습니다." }, 400);
  }
  if (body.jobType != null && !["OFFICE", "DELIVERY", "SALES"].includes(body.jobType)) {
    return c.json({ error: "직군은 사무직/배송직/영업직 중 하나여야 합니다." }, 400);
  }
  if (body.employmentType != null && !["REGULAR", "CONTRACT"].includes(body.employmentType)) {
    return c.json({ error: "고용형태는 정규직 또는 계약직이어야 합니다." }, 400);
  }
  // 지입 여부는 배송직에서만 의미가 있다 — 그 외 직군이면 값을 받아도 저장하지 않는다.
  const isOwnerOperator = body.jobType === "DELIVERY" ? (body.isOwnerOperator ?? null) : null;

  const db = getDb(c.env.DB);

  const department = await db.query.departments.findFirst({
    where: eq(departments.id, departmentId),
  });
  if (!department || !department.isActive) {
    return c.json({ error: "유효하지 않은 부서입니다." }, 400);
  }
  const jobGrade = await db.query.jobGrades.findFirst({ where: eq(jobGrades.id, jobGradeId) });
  if (!jobGrade || !jobGrade.isActive) {
    return c.json({ error: "유효하지 않은 직급입니다." }, 400);
  }
  if (jobTitleId) {
    const jobTitle = await db.query.jobTitles.findFirst({ where: eq(jobTitles.id, jobTitleId) });
    if (!jobTitle || !jobTitle.isActive) {
      return c.json({ error: "유효하지 않은 직책입니다." }, 400);
    }
  }
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role || !role.isActive) {
    return c.json({ error: "유효하지 않은 역할입니다." }, 400);
  }

  const employeeId = await generateEmployeeId(db, department.code);
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const actorId = c.get("currentUserId");

  const insertStatements = [
    db.insert(employees).values({
      employeeId,
      name,
      departmentId,
      jobGradeId,
      jobTitleId: jobTitleId ?? null,
      hireDate,
      mobilePhone,
      extensionNumber: extensionNumber ?? null,
      address: address ?? null,
      employmentStatus: employmentStatus === "LEAVE" ? "LEAVE" : "ACTIVE",
      jobType: (body.jobType as "OFFICE" | "DELIVERY" | "SALES" | undefined) ?? "OFFICE",
      employmentType: (body.employmentType as "REGULAR" | "CONTRACT" | undefined) ?? "REGULAR",
      isOwnerOperator,
      passwordHash,
      mustChangePassword: true,
      roleId,
      createdBy: actorId,
      updatedBy: actorId,
    }),
    db.insert(employeeAssignmentHistory).values({
      employeeId,
      departmentId,
      jobGradeId,
      jobTitleId: jobTitleId ?? null,
      effectiveDate: hireDate,
      reason: "최초 등록",
      createdBy: actorId,
    }),
  ] as const;

  const extraStatements = [];
  if (baseSalary != null) {
    extraStatements.push(
      db.insert(employeeCompensations).values({
        employeeId,
        baseSalary,
        effectiveDate: hireDate,
        reason: "입사",
        createdBy: actorId,
      }),
    );
  }
  if (initialLeaveDays != null) {
    extraStatements.push(
      db.insert(employeeLeaveBalances).values({
        employeeId,
        year: Number(hireDate.slice(0, 4)),
        grantedDays: initialLeaveDays,
        usedDays: 0,
        carriedOverDays: 0,
      }),
    );
    extraStatements.push(
      db.insert(leaveGrants).values({
        employeeId,
        year: Number(hireDate.slice(0, 4)),
        days: initialLeaveDays,
        reason: "입사 시 부여",
        effectiveDate: hireDate,
        createdBy: actorId,
      }),
    );
  }

  await db.batch([...insertStatements, ...extraStatements]);

  // 연차일수를 관리자가 직접 입력하지 않았다면, 입사일 기준으로 밀린(과거 입사자라면 소급까지 포함한)
  // 연차를 등록 즉시 계산해서 반영한다 — 다음 날 자정 자동발생 배치를 기다릴 필요가 없도록.
  if (initialLeaveDays == null) {
    await accrueLeaveForNewEmployee(db, employeeId, hireDate);
  }

  const created = await db.query.employees.findFirst({
    ...employeeDetail,
    where: eq(employees.employeeId, employeeId),
  });

  return c.json({ ...created, passwordHash: undefined, tempPassword }, 201);
});

const SELF_EDIT_FIELDS = new Set(["mobilePhone", "extensionNumber", "address"]);

employeesRoute.patch("/:id", async (c) => {
  const employeeId = c.req.param("id");
  const actorId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);

  const current = await db.query.employees.findFirst({ where: eq(employees.employeeId, employeeId) });
  if (!current) return c.json({ error: "직원을 찾을 수 없습니다." }, 404);

  const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
  const codes = await getPermissionCodes(db, actor!.roleId);
  const isSelf = employeeId === actorId;
  const canWriteAll = codes.has("EMPLOYEE_WRITE");
  if (!isSelf && !canWriteAll) {
    return c.json({ error: "수정 권한이 없습니다." }, 403);
  }

  const body = await c.req
    .json<Record<string, unknown>>()
    .catch(() => ({}) as Record<string, unknown>);

  if (isSelf && !canWriteAll) {
    const attemptedOther = Object.keys(body).some((key) => !SELF_EDIT_FIELDS.has(key));
    if (attemptedOther) {
      return c.json({ error: "본인 정보는 휴대폰번호/내선번호/주소만 수정할 수 있습니다." }, 403);
    }
  }

  if (body.employmentStatus != null && body.employmentStatus !== "ACTIVE" && body.employmentStatus !== "LEAVE") {
    return c.json({ error: "재직상태는 재직 또는 휴직만 이 화면에서 변경할 수 있습니다." }, 400);
  }
  if (body.jobType != null && !["OFFICE", "DELIVERY", "SALES"].includes(body.jobType as string)) {
    return c.json({ error: "직군은 사무직/배송직/영업직 중 하나여야 합니다." }, 400);
  }
  if (body.employmentType != null && !["REGULAR", "CONTRACT"].includes(body.employmentType as string)) {
    return c.json({ error: "고용형태는 정규직 또는 계약직이어야 합니다." }, 400);
  }
  if (typeof body.hireDate === "string" && !body.hireDate.trim()) {
    return c.json({ error: "입사일을 입력하세요." }, 400);
  }
  const baseSalary = typeof body.baseSalary === "number" ? body.baseSalary : undefined;
  if (baseSalary != null && baseSalary < 0) return c.json({ error: "급여는 0 이상이어야 합니다." }, 400);
  // 현재 표시값과의 차이(음수면 조정 차감)만 넘어온다 — 0이면 값이 그대로라는 뜻이라 무시한다.
  const additionalLeaveDays = typeof body.additionalLeaveDays === "number" ? body.additionalLeaveDays : undefined;

  // 이름은 발급 후 수정 불가 — PATCH 바디에 실려와도 절대 반영하지 않는다(관리자가 직접
  // API를 호출해도 우회 불가하도록 UI가 아니라 여기서 막는다).
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: actorId };
  if (typeof body.hireDate === "string" && body.hireDate.trim()) updates.hireDate = body.hireDate.trim();
  if ("address" in body) updates.address = body.address ?? null;
  if (typeof body.mobilePhone === "string") updates.mobilePhone = body.mobilePhone.trim();
  if ("extensionNumber" in body) updates.extensionNumber = body.extensionNumber ?? null;
  if (typeof body.roleId === "number") updates.roleId = body.roleId;
  if (typeof body.jobType === "string") updates.jobType = body.jobType;
  if (typeof body.employmentType === "string") updates.employmentType = body.employmentType;
  if ("isOwnerOperator" in body) {
    const effectiveJobType = typeof body.jobType === "string" ? body.jobType : current.jobType;
    updates.isOwnerOperator = effectiveJobType === "DELIVERY" ? (body.isOwnerOperator as boolean | null) : null;
  }
  if (body.employmentStatus === "ACTIVE" || body.employmentStatus === "LEAVE") {
    updates.employmentStatus = body.employmentStatus;
    updates.statusChangedAt = new Date().toISOString();
  }

  const nextDepartmentId = typeof body.departmentId === "number" ? body.departmentId : current.departmentId;
  const nextJobGradeId = typeof body.jobGradeId === "number" ? body.jobGradeId : current.jobGradeId;
  const nextJobTitleId = "jobTitleId" in body ? (body.jobTitleId as number | null) : current.jobTitleId;
  const assignmentChanged =
    nextDepartmentId !== current.departmentId ||
    nextJobGradeId !== current.jobGradeId ||
    nextJobTitleId !== current.jobTitleId;

  if (assignmentChanged) {
    updates.departmentId = nextDepartmentId;
    updates.jobGradeId = nextJobGradeId;
    updates.jobTitleId = nextJobTitleId;
  }

  if (assignmentChanged) {
    await db.batch([
      db.update(employees).set(updates).where(eq(employees.employeeId, employeeId)),
      db.insert(employeeAssignmentHistory).values({
        employeeId,
        departmentId: nextDepartmentId,
        jobGradeId: nextJobGradeId,
        jobTitleId: nextJobTitleId,
        effectiveDate: new Date().toISOString().slice(0, 10),
        reason: typeof body.reason === "string" ? body.reason : "부서/직급 변경",
        createdBy: actorId,
      }),
    ]);
  } else {
    await db.update(employees).set(updates).where(eq(employees.employeeId, employeeId));
  }

  const today = new Date().toISOString().slice(0, 10);
  if (baseSalary != null) {
    await db.insert(employeeCompensations).values({
      employeeId,
      baseSalary,
      effectiveDate: today,
      reason: "급여 조정",
      createdBy: actorId,
    });
  }
  if (additionalLeaveDays) {
    await grantLeave(db, employeeId, Number(today.slice(0, 4)), additionalLeaveDays, "관리자 조정", today, actorId);
  }

  const updated = await db.query.employees.findFirst({
    ...employeeDetail,
    where: eq(employees.employeeId, employeeId),
  });
  return c.json(stripPrivateFields(updated!));
});

employeesRoute.post("/:id/resign", requirePermission("EMPLOYEE_WRITE"), async (c) => {
  const employeeId = c.req.param("id");
  const db = getDb(c.env.DB);
  const current = await db.query.employees.findFirst({ where: eq(employees.employeeId, employeeId) });
  if (!current) return c.json({ error: "직원을 찾을 수 없습니다." }, 404);

  const actorId = c.get("currentUserId");
  await db
    .update(employees)
    .set({
      employmentStatus: "RESIGNED",
      statusChangedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    })
    .where(eq(employees.employeeId, employeeId));

  const updated = await db.query.employees.findFirst({
    ...employeeDetail,
    where: eq(employees.employeeId, employeeId),
  });
  return c.json(stripPrivateFields(updated!));
});
