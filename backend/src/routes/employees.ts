import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { generateEmployeeId, generateTempPassword } from "../lib/employeeId";
import { getPermissionCodes } from "../lib/permissions";
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

// 화면 단위뿐 아니라 여기(API)에서도 매번 확인한다 — 프론트가 메뉴만 숨기는 방식은 쓰지 않는다.
// 일반직원은 본인 것만, 부서관리자는 소속 부서만, 시스템관리자는 전체를 볼 수 있다.
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
  } else if (codes.has("EMPLOYEE_READ_DEPARTMENT")) {
    conditions.push(eq(employees.departmentId, actor.departmentId));
  } else {
    return c.json({ error: "직원 목록을 조회할 권한이 없습니다." }, 403);
  }

  const rows = await db.query.employees.findMany({
    ...employeeDetail,
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: (e, { asc }) => [asc(e.employeeId)],
  });

  return c.json(rows.map(({ passwordHash: _passwordHash, ...rest }) => rest));
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

  if (targetId !== actorId) {
    const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
    const codes = await getPermissionCodes(db, actor!.roleId);
    const allowed =
      codes.has("EMPLOYEE_READ_ALL") ||
      (codes.has("EMPLOYEE_READ_DEPARTMENT") && target.departmentId === actor!.departmentId);
    if (!allowed) return c.json({ error: "조회 권한이 없습니다." }, 403);
  }

  const { passwordHash: _passwordHash, ...rest } = target;
  return c.json(rest);
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

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: actorId };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.hireDate === "string") updates.hireDate = body.hireDate.trim();
  if ("address" in body) updates.address = body.address ?? null;
  if (typeof body.mobilePhone === "string") updates.mobilePhone = body.mobilePhone.trim();
  if ("extensionNumber" in body) updates.extensionNumber = body.extensionNumber ?? null;
  if (typeof body.roleId === "number") updates.roleId = body.roleId;
  if (typeof body.jobType === "string") updates.jobType = body.jobType;
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

  const updated = await db.query.employees.findFirst({
    ...employeeDetail,
    where: eq(employees.employeeId, employeeId),
  });
  const { passwordHash: _passwordHash, ...rest } = updated!;
  return c.json(rest);
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
  const { passwordHash: _passwordHash, ...rest } = updated!;
  return c.json(rest);
});
