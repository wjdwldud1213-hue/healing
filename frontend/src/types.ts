export type Department = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
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
  mobilePhone: string;
  extensionNumber: string | null;
  address: string | null;
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
  /** /auth/me 응답에만 포함된다 (로그인한 사용자 본인의 권한 코드 목록) */
  permissions?: string[];
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
