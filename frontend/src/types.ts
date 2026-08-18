export type Department = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobGrade = { id: number; name: string; sortOrder: number; isActive: boolean };
export type JobTitle = JobGrade;

export type Role = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type Permission = {
  id: number;
  code: string;
  name: string;
  category: string | null;
};

export type EmploymentStatus = "ACTIVE" | "LEAVE" | "RESIGNED";
export type JobType = "OFFICE" | "DELIVERY" | "SALES";
export type EmploymentType = "REGULAR" | "CONTRACT";

export type Employee = {
  employeeId: string;
  name: string;
  departmentId: number;
  jobGradeId: number;
  jobTitleId: number | null;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  statusChangedAt: string;
  jobType: JobType;
  employmentType: EmploymentType;
  /** 배송직일 때만 의미 있음(그 외 직군은 항상 null) */
  isOwnerOperator: boolean | null;
  mobilePhone: string;
  extensionNumber: string | null;
  address: string | null;
  notes: string | null;
  kakaoUserId: string | null;
  mustChangePassword: boolean;
  roleId: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  department: Department;
  jobGrade: JobGrade;
  jobTitle: JobTitle | null;
  role: Role;
  tempPassword?: string;
  /** /auth/me, /auth/login 응답에만 포함된다 (로그인한 사용자 본인의 권한 코드 목록) */
  permissions?: string[];
  /** /auth/me, /auth/login 응답에만 포함된다 (상무 이상 직급 — 전자결재 전체 문서함 열람 가능 여부) */
  isExecutive?: boolean;
};

export type LeaveBalance = {
  id: number;
  employeeId: string;
  year: number;
  grantedDays: number;
  usedDays: number;
  carriedOverDays: number;
  updatedAt: string;
};

export type LeaveGrant = {
  id: number;
  employeeId: string;
  year: number;
  days: number;
  reason: string;
  effectiveDate: string;
  createdBy: string | null;
  createdAt: string;
};

export type LeaveRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type LeaveRequest = {
  id: number;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveRequestStatus;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  /** 이 신청을 만든 결재문서 id. 전자결제 도입 이전(레거시) 행은 null. */
  documentId: number | null;
};

export type WorkPlace = {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceStatus = "WORKING" | "DONE" | "PENDING_APPROVAL" | "REJECTED";
export type AttendanceCheckType = "NORMAL" | "FIELD" | "MANUAL";
export type AttendanceDeviceType = "WEB" | "IOS" | "ANDROID";

export type AttendanceLog = {
  id: number;
  employeeId: string;
  workPlaceId: number | null;
  checkInAt: string;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkInAccuracy: number | null;
  checkOutAccuracy: number | null;
  checkInIsMocked: boolean | null;
  checkOutIsMocked: boolean | null;
  checkInDeviceType: AttendanceDeviceType;
  checkOutDeviceType: AttendanceDeviceType | null;
  checkInType: AttendanceCheckType;
  checkOutType: AttendanceCheckType | null;
  status: AttendanceStatus;
  reason: string | null;
  approverId: string | null;
  approvedAt: string | null;
  createdAt: string;
};

// ── 전자결제(전자결재) ───────────────────────────────────
export type ApprovalDocumentType = "GENERAL" | "LEAVE";
export type ApprovalDocumentStatus = "IN_PROGRESS" | "APPROVED" | "REJECTED" | "CANCELED";
export type ApprovalStepStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ApprovalPersonRef = { employeeId: string; name: string };

export type ApprovalStep = {
  id: number;
  documentId: number;
  stepOrder: number;
  approverId: string;
  status: ApprovalStepStatus;
  comment: string | null;
  decidedAt: string | null;
  createdAt: string;
  approver: ApprovalPersonRef;
};

export type ApprovalDocument = {
  id: number;
  documentType: ApprovalDocumentType;
  title: string;
  content: string | null;
  drafterId: string;
  status: ApprovalDocumentStatus;
  currentStepOrder: number;
  createdAt: string;
  updatedAt: string;
  drafter: ApprovalPersonRef;
  steps: ApprovalStep[];
};

export type ApprovalDocumentDetail = ApprovalDocument & { leave: LeaveRequest | null };

export type ApprovalInboxItem = {
  documentId: number;
  documentType: ApprovalDocumentType;
  title: string;
  documentStatus: ApprovalDocumentStatus;
  drafter: ApprovalPersonRef;
  stepOrder: number;
  stepStatus: ApprovalStepStatus;
  createdAt: string;
};

export type ApproverCandidate = {
  employeeId: string;
  name: string;
  departmentName: string;
  jobGradeName: string;
};

export type RecommendedApprovalStep = { stepOrder: number; approver: ApproverCandidate | null };

// ── 자료실 ──────────────────────────────────────────
export type DocumentCategory = "주민등록등본" | "보건증" | "기타";
export type DocumentVisibility = "PUBLIC" | "ADMIN";

export type StoredDocument = {
  id: number;
  employeeId: string;
  category: DocumentCategory;
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  visibility: DocumentVisibility;
  createdAt: string;
  employee: { employeeId: string; name: string };
};
