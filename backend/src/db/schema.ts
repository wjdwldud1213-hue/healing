import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, check } from "drizzle-orm/sqlite-core";

// ── 부서 ─────────────────────────────────────────────
// 부서코드(A~Z)는 한 번 배정되면 다른 부서에 재배정하지 않는다.
// 이미 발급된 사번의 부서코드 의미가 절대 바뀌면 안 되기 때문.
export const departments = sqliteTable(
  "departments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [check("departments_code_format", sql`${t.code} GLOB '[A-Z]'`)],
);

// 부서코드별 사번 채번 카운터. 사번 뒤 4자리를 여기서 순서대로 발급한다.
export const departmentCodeSequences = sqliteTable("department_code_sequences", {
  departmentCode: text("department_code").primaryKey(),
  lastSeq: integer("last_seq").notNull().default(0),
});

// ── 직급 / 직책 (코드 테이블) ──────────────────────────
export const jobGrades = sqliteTable("job_grades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const jobTitles = sqliteTable("job_titles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// ── 역할 / 권한 ──────────────────────────────────────
export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const permissions = sqliteTable("permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id),
    grantedBy: text("granted_by"),
    grantedAt: text("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

// ── 직원 인사정보 ─────────────────────────────────────
// employee_id가 곧 로그인 아이디이며, 발급 후 절대 변경하지 않는다.
// 퇴사해도 행을 지우지 않고 employment_status만 RESIGNED로 바꾼다.
export const employees = sqliteTable(
  "employees",
  {
    employeeId: text("employee_id").primaryKey(),
    name: text("name").notNull(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    jobGradeId: integer("job_grade_id")
      .notNull()
      .references(() => jobGrades.id),
    jobTitleId: integer("job_title_id").references(() => jobTitles.id),
    hireDate: text("hire_date").notNull(),
    employmentStatus: text("employment_status", {
      enum: ["ACTIVE", "LEAVE", "RESIGNED"],
    })
      .notNull()
      .default("ACTIVE"),
    statusChangedAt: text("status_changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    mobilePhone: text("mobile_phone").notNull(),
    extensionNumber: text("extension_number"),
    address: text("address"),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(true),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
  },
  (t) => [
    check("employees_id_format", sql`${t.employeeId} GLOB '[A-Z][0-9][0-9][0-9][0-9]'`),
    check(
      "employees_employment_status_check",
      sql`${t.employmentStatus} IN ('ACTIVE', 'LEAVE', 'RESIGNED')`,
    ),
  ],
);

// 부서/직급 변경 이력. employees 테이블은 "현재 상태"만 담고
// 과거에 어느 부서/직급이었는지는 이 테이블에서 조회한다.
export const employeeAssignmentHistory = sqliteTable("employee_assignment_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.employeeId),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id),
  jobGradeId: integer("job_grade_id")
    .notNull()
    .references(() => jobGrades.id),
  jobTitleId: integer("job_title_id").references(() => jobTitles.id),
  effectiveDate: text("effective_date").notNull(),
  reason: text("reason"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ── 급여 이력 ────────────────────────────────────────
// employees에는 "현재 급여" 필드를 두지 않는다. 급여는 시점마다 값이 바뀌므로
// 이 테이블에서 employee_id별로 effective_date가 가장 최근인 행을 조회해 현재값을 구한다.
export const employeeCompensations = sqliteTable(
  "employee_compensations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.employeeId),
    baseSalary: integer("base_salary").notNull(),
    effectiveDate: text("effective_date").notNull(),
    reason: text("reason"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [check("employee_compensations_salary_check", sql`${t.baseSalary} >= 0`)],
);

// ── 연차 이력 (연도별) ────────────────────────────────
// 연차는 연도마다 발생/사용/이월되는 값이라 employees의 단일 필드로 표현할 수 없다.
// 잔여 연차 = granted_days + carried_over_days - used_days.
export const employeeLeaveBalances = sqliteTable(
  "employee_leave_balances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.employeeId),
    year: integer("year").notNull(),
    grantedDays: real("granted_days").notNull().default(0),
    usedDays: real("used_days").notNull().default(0),
    carriedOverDays: real("carried_over_days").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("employee_leave_balances_employee_year_idx").on(t.employeeId, t.year),
    check(
      "employee_leave_balances_days_check",
      sql`${t.grantedDays} >= 0 AND ${t.usedDays} >= 0`,
    ),
  ],
);

// ── 로그인 세션 / 비밀번호 재설정 ───────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.employeeId),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastActivityAt: text("last_activity_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // 절대 만료 시각. "로그인 상태 유지" 여부에 따라 로그인 시점에 계산해서 저장한다.
  // 기존(이 컬럼 추가 이전) 세션은 NULL이며, 이 경우 idle timeout만 적용된다.
  expiresAt: text("expires_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  revokedAt: text("revoked_at"),
});

export const passwordResetRequests = sqliteTable(
  "password_reset_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.employeeId),
    requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
      .notNull()
      .default("PENDING"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
  },
  (t) => [
    check(
      "password_reset_requests_status_check",
      sql`${t.status} IN ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
  ],
);

// ── 관계 (조회 편의용) ────────────────────────────────
export const departmentsRelations = relations(departments, ({ many }) => ({
  employees: many(employees),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  employees: many(employees),
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  jobGrade: one(jobGrades, { fields: [employees.jobGradeId], references: [jobGrades.id] }),
  jobTitle: one(jobTitles, { fields: [employees.jobTitleId], references: [jobTitles.id] }),
  role: one(roles, { fields: [employees.roleId], references: [roles.id] }),
  assignmentHistory: many(employeeAssignmentHistory),
  compensations: many(employeeCompensations),
  leaveBalances: many(employeeLeaveBalances),
  sessions: many(sessions),
}));

export const employeeAssignmentHistoryRelations = relations(
  employeeAssignmentHistory,
  ({ one }) => ({
    employee: one(employees, {
      fields: [employeeAssignmentHistory.employeeId],
      references: [employees.employeeId],
    }),
    department: one(departments, {
      fields: [employeeAssignmentHistory.departmentId],
      references: [departments.id],
    }),
    jobGrade: one(jobGrades, {
      fields: [employeeAssignmentHistory.jobGradeId],
      references: [jobGrades.id],
    }),
    jobTitle: one(jobTitles, {
      fields: [employeeAssignmentHistory.jobTitleId],
      references: [jobTitles.id],
    }),
  }),
);

export const employeeCompensationsRelations = relations(employeeCompensations, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeCompensations.employeeId],
    references: [employees.employeeId],
  }),
}));

export const employeeLeaveBalancesRelations = relations(employeeLeaveBalances, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeLeaveBalances.employeeId],
    references: [employees.employeeId],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  employee: one(employees, { fields: [sessions.employeeId], references: [employees.employeeId] }),
}));
