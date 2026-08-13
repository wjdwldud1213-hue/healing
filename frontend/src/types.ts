export type Department = {
  id: number;
  code: string;
  name: string;
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
  isActive: boolean;
};

export type Permission = {
  id: number;
  code: string;
  name: string;
  category: string | null;
};

export type EmploymentStatus = "ACTIVE" | "LEAVE" | "RESIGNED";

export type Employee = {
  employeeId: string;
  name: string;
  departmentId: number;
  jobGradeId: number;
  jobTitleId: number | null;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  statusChangedAt: string;
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
