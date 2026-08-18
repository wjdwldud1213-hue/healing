import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  uniqueIndex,
  check,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

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
    // 이 부서를 담당하는 임원. 직원 등록 시 부서가 필수라 임원도 어쩔 수 없이 임의 부서(예: 관리부)에
    // 소속되지만, 실제 조직 구조상 의미 있는 건 "이 부서를 누가 담당하는가"이므로 별도로 저장한다.
    // 조직도는 employees.departmentId가 아니라 이 값을 기준으로 부서를 담당 임원 아래에 묶어서 그린다.
    managerId: text("manager_id").references((): AnySQLiteColumn => employees.employeeId),
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
    // 출퇴근 처리 방식을 가른다: 사무직은 근무지 반경 검증, 배송직은 출근만 반경 검증(퇴근은 현장),
    // 영업직은 출퇴근 모두 위치 제한 없음. lib/attendance.ts의 requiresRadiusCheck가 이 값을 사용한다.
    jobType: text("job_type", { enum: ["OFFICE", "DELIVERY", "SALES"] })
      .notNull()
      .default("OFFICE"),
    // 정규직/계약직 구분 — 근태·반경 검증 로직과는 무관한 순수 인사 정보 필드.
    employmentType: text("employment_type", { enum: ["REGULAR", "CONTRACT"] })
      .notNull()
      .default("REGULAR"),
    // 배송직(jobType=DELIVERY)일 때만 의미있는 값 — 지입(본인 소유/리스 차량으로 운행) 여부.
    // 사무직/영업직은 항상 null.
    isOwnerOperator: integer("is_owner_operator", { mode: "boolean" }),
    mobilePhone: text("mobile_phone").notNull(),
    extensionNumber: text("extension_number"),
    address: text("address"),
    // 셀프 비밀번호 재설정용 카카오 계정 연동. 한 카카오 계정은 한 직원에만 연동되며(unique),
    // 이 값이 없으면 RequireAuth가 /link-kakao로 강제 이동시킨다.
    kakaoUserId: text("kakao_user_id").unique(),
    // 조회 전용 잠금 해제용 PIN(4자리 이상) 해시. 본인이 마이페이지에서 직접 설정하며,
    // EMPLOYEE_WRITE 권한이 없는 조회자가 상세보기에서 마스킹된 필드를 풀 때 사용한다.
    viewPinHash: text("view_pin_hash"),
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
    check("employees_job_type_check", sql`${t.jobType} IN ('OFFICE', 'DELIVERY', 'SALES')`),
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

// ── 연차 발생 이력 ────────────────────────────────────
// employee_leave_balances는 연도별 "현재 집계"만 담고, 언제/왜 발생했는지의 감사 이력은
// 남지 않는다. employee_compensations(급여 이력)와 동일한 append-only 패턴으로
// 발생/조정 이벤트마다 한 행씩 쌓는다.
export const leaveGrants = sqliteTable("leave_grants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.employeeId),
  year: integer("year").notNull(),
  days: real("days").notNull(), // 이 이벤트로 부여된 일수(양수). 차감은 별도 사유의 음수 행으로 남긴다.
  reason: text("reason").notNull(), // 예: "입사 시 부여", "연차 자동발생", "관리자 조정"
  effectiveDate: text("effective_date").notNull(),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ── 연차 신청 ────────────────────────────────────────
// status/decidedBy/decidedAt은 결재(승인/반려) 기능이 도입된 뒤에도 그대로 사용된다.
// 실제 결재 흐름(누가 언제 몇 차 결재했는지)은 documentId로 연결된 approval_documents/approval_steps에서 관리하고,
// 최종 승인/반려 결과만 이 테이블에 반영된다(감사/조회 편의를 위한 비정규화).
export const leaveRequests = sqliteTable(
  "leave_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.employeeId),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    days: real("days").notNull(),
    reason: text("reason"),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
      .notNull()
      .default("PENDING"),
    requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    decidedBy: text("decided_by"),
    decidedAt: text("decided_at"),
    // 이 신청을 만든 결재문서. 전자결제 도입 이전(레거시) 행은 NULL.
    documentId: integer("document_id").references(() => approvalDocuments.id),
  },
  (t) => [
    check("leave_requests_days_check", sql`${t.days} > 0`),
    check("leave_requests_status_check", sql`${t.status} IN ('PENDING', 'APPROVED', 'REJECTED')`),
  ],
);

// ── 전자결제(전자결재) ───────────────────────────────────
// 문서 1건 = 결재 요청 1건. GENERAL은 제목+본문 자유양식, LEAVE는 연차 신청(leaveRequests에 상세 보관, documentId로 역참조)이다.
// currentStepOrder는 지금 대기 중인 단계 번호를 가리킨다.
export const approvalDocuments = sqliteTable(
  "approval_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentType: text("document_type", { enum: ["GENERAL", "LEAVE"] }).notNull(),
    title: text("title").notNull(),
    content: text("content"),
    drafterId: text("drafter_id")
      .notNull()
      .references(() => employees.employeeId),
    status: text("status", { enum: ["IN_PROGRESS", "APPROVED", "REJECTED", "CANCELED"] })
      .notNull()
      .default("IN_PROGRESS"),
    currentStepOrder: integer("current_step_order").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    check("approval_documents_document_type_check", sql`${t.documentType} IN ('GENERAL','LEAVE')`),
    check(
      "approval_documents_status_check",
      sql`${t.status} IN ('IN_PROGRESS','APPROVED','REJECTED','CANCELED')`,
    ),
  ],
);

// 문서 1건의 결재 단계들. stepOrder는 문서 내에서 1부터 연속일 필요는 없다 — 결재선 추천 로직이
// 1차(부서 최고직급자)를 생략하는 경우 stepOrder=2(2차/최종) 단계 하나만 존재할 수 있다.
export const approvalSteps = sqliteTable(
  "approval_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: integer("document_id")
      .notNull()
      .references(() => approvalDocuments.id),
    stepOrder: integer("step_order").notNull(),
    approverId: text("approver_id")
      .notNull()
      .references(() => employees.employeeId),
    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
      .notNull()
      .default("PENDING"),
    comment: text("comment"),
    decidedAt: text("decided_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("approval_steps_document_step_idx").on(t.documentId, t.stepOrder),
    check("approval_steps_status_check", sql`${t.status} IN ('PENDING','APPROVED','REJECTED')`),
  ],
);

// ── 근무지 (출퇴근 반경 검증 기준점, 다중 지점 대비) ──────
export const workPlaces = sqliteTable("work_places", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // 관리자가 입력한 원본 주소. 위도/경도는 이 주소를 카카오 로컬 API로 지오코딩한 결과(반경 계산용).
  address: text("address").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  radiusM: integer("radius_m").notNull().default(100),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ── 출퇴근 기록 ──────────────────────────────────────
// 체크인/체크아웃 정보를 한 행에 담는다(출근 시 insert, 퇴근 시 같은 행을 update).
// reason/approverId/approvedAt과 status의 PENDING_APPROVAL/REJECTED, checkInType의 MANUAL은
// 2단계(사무직 외근 예외신청/승인)에서 사용할 자리 — 1단계에서는 항상 NULL/미사용이다.
export const attendanceLogs = sqliteTable(
  "attendance_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.employeeId),
    workPlaceId: integer("work_place_id").references(() => workPlaces.id),
    checkInAt: text("check_in_at").notNull(),
    checkOutAt: text("check_out_at"),
    checkInLat: real("check_in_lat"),
    checkInLng: real("check_in_lng"),
    checkOutLat: real("check_out_lat"),
    checkOutLng: real("check_out_lng"),
    checkInAccuracy: real("check_in_accuracy"),
    checkOutAccuracy: real("check_out_accuracy"),
    checkInIsMocked: integer("check_in_is_mocked", { mode: "boolean" }),
    checkOutIsMocked: integer("check_out_is_mocked", { mode: "boolean" }),
    checkInDeviceType: text("check_in_device_type", { enum: ["WEB", "IOS", "ANDROID"] }).notNull(),
    checkOutDeviceType: text("check_out_device_type", { enum: ["WEB", "IOS", "ANDROID"] }),
    checkInType: text("check_in_type", { enum: ["NORMAL", "FIELD", "MANUAL"] }).notNull(),
    checkOutType: text("check_out_type", { enum: ["NORMAL", "FIELD", "MANUAL"] }),
    status: text("status", { enum: ["WORKING", "DONE", "PENDING_APPROVAL", "REJECTED"] })
      .notNull()
      .default("WORKING"),
    reason: text("reason"),
    approverId: text("approver_id").references(() => employees.employeeId),
    approvedAt: text("approved_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    // 동시에 두 건 이상 출근(WORKING) 상태를 가질 수 없도록 DB 레벨에서도 막는다.
    uniqueIndex("attendance_logs_working_employee_idx")
      .on(t.employeeId)
      .where(sql`${t.status} = 'WORKING'`),
    check(
      "attendance_logs_status_check",
      sql`${t.status} IN ('WORKING', 'DONE', 'PENDING_APPROVAL', 'REJECTED')`,
    ),
    check(
      "attendance_logs_check_in_type_check",
      sql`${t.checkInType} IN ('NORMAL', 'FIELD', 'MANUAL')`,
    ),
    check(
      "attendance_logs_check_out_type_check",
      sql`${t.checkOutType} IS NULL OR ${t.checkOutType} IN ('NORMAL', 'FIELD', 'MANUAL')`,
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

// 관리자 승인 방식(레거시)의 이력 테이블. 카카오 연동 셀프 재설정으로 전환한 뒤로는
// 더 이상 새로 쓰지 않지만, 과거 이력 보존을 위해 테이블/스키마 정의는 그대로 남겨둔다.
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

// 카카오 계정으로 본인확인이 끝난 뒤 발급되는 1회용 단기 토큰. 이 토큰이 있어야
// 실제 비밀번호를 바꿀 수 있다(카카오 인증 -> 토큰 발급 -> 토큰+새 비밀번호로 변경, 2단계 분리).
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.employeeId),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ── 관계 (조회 편의용) ────────────────────────────────
export const departmentsRelations = relations(departments, ({ one, many }) => ({
  employees: many(employees),
  manager: one(employees, { fields: [departments.managerId], references: [employees.employeeId] }),
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
  leaveGrants: many(leaveGrants),
  leaveRequests: many(leaveRequests),
  sessions: many(sessions),
  attendanceLogs: many(attendanceLogs),
  passwordResetTokens: many(passwordResetTokens),
}));

export const workPlacesRelations = relations(workPlaces, ({ many }) => ({
  attendanceLogs: many(attendanceLogs),
}));

// approverId는 leaveRequests.decidedBy/createdBy와 동일하게 감사 목적의 참조 컬럼이라
// employees 쪽에 반대 관계(many)를 두지 않는다 — relations()로 조인 조회하지 않고 필요할 때 직접 조회.
export const attendanceLogsRelations = relations(attendanceLogs, ({ one }) => ({
  employee: one(employees, {
    fields: [attendanceLogs.employeeId],
    references: [employees.employeeId],
  }),
  workPlace: one(workPlaces, {
    fields: [attendanceLogs.workPlaceId],
    references: [workPlaces.id],
  }),
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

export const leaveGrantsRelations = relations(leaveGrants, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveGrants.employeeId],
    references: [employees.employeeId],
  }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.employeeId],
  }),
  document: one(approvalDocuments, {
    fields: [leaveRequests.documentId],
    references: [approvalDocuments.id],
  }),
}));

export const approvalDocumentsRelations = relations(approvalDocuments, ({ one, many }) => ({
  drafter: one(employees, {
    fields: [approvalDocuments.drafterId],
    references: [employees.employeeId],
  }),
  steps: many(approvalSteps),
}));

export const approvalStepsRelations = relations(approvalSteps, ({ one }) => ({
  document: one(approvalDocuments, {
    fields: [approvalSteps.documentId],
    references: [approvalDocuments.id],
  }),
  approver: one(employees, {
    fields: [approvalSteps.approverId],
    references: [employees.employeeId],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  employee: one(employees, { fields: [sessions.employeeId], references: [employees.employeeId] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  employee: one(employees, {
    fields: [passwordResetTokens.employeeId],
    references: [employees.employeeId],
  }),
}));
