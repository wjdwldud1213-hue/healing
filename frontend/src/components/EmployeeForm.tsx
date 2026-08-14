import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Department, Employee, EmploymentStatus, JobGrade, JobType, Role } from "../types";

const JOB_TYPE_LABEL: Record<JobType, string> = {
  OFFICE: "사무직",
  DELIVERY: "배송직",
  SALES: "영업직",
};

type Props = {
  mode: "create" | "edit";
  employee?: Employee;
  onDone: (result?: Employee) => void;
};

export function EmployeeForm({ mode, employee, onDone }: Props) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobGrades, setJobGrades] = useState<JobGrade[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [issuedId, setIssuedId] = useState<string | null>(null);

  const [name, setName] = useState(employee?.name ?? "");
  const [departmentId, setDepartmentId] = useState(employee?.departmentId ?? 0);
  const [jobGradeId, setJobGradeId] = useState(employee?.jobGradeId ?? 0);
  const [hireDate, setHireDate] = useState(employee?.hireDate ?? "");
  const [mobilePhone, setMobilePhone] = useState(employee?.mobilePhone ?? "");
  const [extensionNumber, setExtensionNumber] = useState(employee?.extensionNumber ?? "");
  const [roleId, setRoleId] = useState(employee?.roleId ?? 0);
  const [jobType, setJobType] = useState<JobType>(employee?.jobType ?? "OFFICE");
  const [address, setAddress] = useState(employee?.address ?? "");
  const [baseSalary, setBaseSalary] = useState("");
  const [initialLeaveDays, setInitialLeaveDays] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState<Extract<EmploymentStatus, "ACTIVE" | "LEAVE">>(
    employee?.employmentStatus === "LEAVE" ? "LEAVE" : "ACTIVE",
  );
  // 이미 퇴사 처리된 직원은 이 폼에서 재직상태를 되돌릴 수 없다 — 퇴사는 별도 "퇴사처리" 버튼으로만 처리한다.
  const canEditStatus = mode === "create" || employee?.employmentStatus !== "RESIGNED";

  useEffect(() => {
    Promise.all([
      api.get<Department[]>("/departments"),
      api.get<JobGrade[]>("/job-grades"),
      api.get<Role[]>("/roles"),
    ]).then(([d, g, r]) => {
      setDepartments(d.filter((x) => x.isActive));
      setJobGrades(g.filter((x) => x.isActive));
      setRoles(r.filter((x) => x.isActive));
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "create") {
        const created = await api.post<Employee>("/employees", {
          name,
          departmentId,
          jobGradeId,
          hireDate,
          mobilePhone,
          extensionNumber: extensionNumber || null,
          roleId,
          jobType,
          address: address || null,
          baseSalary: baseSalary ? Number(baseSalary) : undefined,
          initialLeaveDays: initialLeaveDays ? Number(initialLeaveDays) : undefined,
          employmentStatus,
        });
        setTempPassword(created.tempPassword ?? null);
        setIssuedId(created.employeeId);
      } else if (employee) {
        const updated = await api.patch<Employee>(`/employees/${employee.employeeId}`, {
          name,
          departmentId,
          jobGradeId,
          hireDate,
          address: address || null,
          mobilePhone,
          extensionNumber: extensionNumber || null,
          roleId,
          jobType,
          ...(canEditStatus ? { employmentStatus } : {}),
        });
        onDone(updated);
      }
    } catch (submitError) {
      setError((submitError as Error).message);
    }
  }

  if (tempPassword && issuedId) {
    return (
      <div className="card notice">
        <h3>직원 등록 완료</h3>
        <p>
          사번 <b>{issuedId}</b> 발급됨. 임시 비밀번호: <b>{tempPassword}</b>
        </p>
        <p className="hint">
          이 비밀번호는 지금 한 번만 보여지므로, 직원에게 바로 전달해 주세요. 최초 로그인 시
          비밀번호 변경이 강제됩니다.
        </p>
        <button type="button" onClick={() => onDone()}>
          확인
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>{mode === "create" ? "직원 등록" : `직원 수정 — ${employee?.employeeId}`}</h3>
      <form onSubmit={handleSubmit} className="stacked-form">
        <label>
          이름
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          부서
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(Number(e.target.value))}
            required
          >
            <option value={0} disabled>
              선택
            </option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          직급
          <select
            value={jobGradeId}
            onChange={(e) => setJobGradeId(Number(e.target.value))}
            required
          >
            <option value={0} disabled>
              선택
            </option>
            {jobGrades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          직군
          <select value={jobType} onChange={(e) => setJobType(e.target.value as JobType)} required>
            {(Object.keys(JOB_TYPE_LABEL) as JobType[]).map((jt) => (
              <option key={jt} value={jt}>
                {JOB_TYPE_LABEL[jt]}
              </option>
            ))}
          </select>
        </label>
        <label>
          입사일
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            required
          />
        </label>
        <label>
          주소
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        {mode === "create" && (
          <label>
            급여 (원)
            <input
              type="number"
              min="0"
              step="1"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              placeholder="미입력 시 급여 이력을 만들지 않음"
            />
          </label>
        )}
        {mode === "create" && (
          <label>
            연차일수
            <input
              type="number"
              min="0"
              step="0.5"
              value={initialLeaveDays}
              onChange={(e) => setInitialLeaveDays(e.target.value)}
              placeholder="미입력 시 연차 이력을 만들지 않음"
            />
          </label>
        )}
        {canEditStatus && (
          <label>
            재직상태
            <select
              value={employmentStatus}
              onChange={(e) => setEmploymentStatus(e.target.value as "ACTIVE" | "LEAVE")}
            >
              <option value="ACTIVE">재직</option>
              <option value="LEAVE">휴직</option>
            </select>
          </label>
        )}
        <label>
          휴대폰번호
          <input
            value={mobilePhone}
            onChange={(e) => setMobilePhone(e.target.value)}
            placeholder="010-0000-0000"
            required
          />
        </label>
        <label>
          내선번호
          <input value={extensionNumber} onChange={(e) => setExtensionNumber(e.target.value)} />
        </label>
        <label>
          권한
          <select value={roleId} onChange={(e) => setRoleId(Number(e.target.value))} required>
            <option value={0} disabled>
              선택
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit">{mode === "create" ? "등록" : "저장"}</button>
          <button type="button" onClick={() => onDone()}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
