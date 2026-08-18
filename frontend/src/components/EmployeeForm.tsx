import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { formatPhoneNumber } from "../lib/phone";
import type {
  Department,
  Employee,
  EmploymentStatus,
  EmploymentType,
  JobGrade,
  JobType,
  Role,
} from "../types";

const JOB_TYPE_LABEL: Record<JobType, string> = {
  OFFICE: "사무직",
  DELIVERY: "배송직",
  SALES: "영업직",
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  REGULAR: "정규직",
  CONTRACT: "계약직",
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
  const [submitting, setSubmitting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [issuedId, setIssuedId] = useState<string | null>(null);

  const [name, setName] = useState(employee?.name ?? "");
  const [departmentId, setDepartmentId] = useState(employee?.departmentId ?? 0);
  const [jobGradeId, setJobGradeId] = useState(employee?.jobGradeId ?? 0);
  const [hireDate, setHireDate] = useState(employee?.hireDate ?? "");
  const [mobilePhone, setMobilePhone] = useState(formatPhoneNumber(employee?.mobilePhone ?? ""));
  const [extensionNumber, setExtensionNumber] = useState(
    formatPhoneNumber(employee?.extensionNumber ?? ""),
  );
  const [roleId, setRoleId] = useState(employee?.roleId ?? 0);
  const [jobType, setJobType] = useState<JobType>(employee?.jobType ?? "OFFICE");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    employee?.employmentType ?? "REGULAR",
  );
  const [isOwnerOperator, setIsOwnerOperator] = useState(employee?.isOwnerOperator ?? false);
  const [address, setAddress] = useState(employee?.address ?? "");
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [baseSalary, setBaseSalary] = useState("");
  const [initialLeaveDays, setInitialLeaveDays] = useState("");
  // 수정 모드에서 "현재값" 기준선 — 급여/연차일수 필드가 이 값과 달라진 경우에만 새 이력을 남긴다.
  const [originalSalary, setOriginalSalary] = useState<number | null>(null);
  const [originalLeaveDays, setOriginalLeaveDays] = useState(0);
  const [employmentStatus, setEmploymentStatus] = useState<Extract<EmploymentStatus, "ACTIVE" | "LEAVE">>(
    employee?.employmentStatus === "LEAVE" ? "LEAVE" : "ACTIVE",
  );
  // 이미 퇴사 처리된 직원은 이 폼에서 재직상태를 되돌릴 수 없다 — 퇴사는 별도 "퇴사처리" 버튼으로만 처리한다.
  const canEditStatus = mode === "create" || employee?.employmentStatus !== "RESIGNED";

  useEffect(() => {
    Promise.all([
      api.getCached<Department[]>("/departments"),
      api.getCached<JobGrade[]>("/job-grades"),
      api.getCached<Role[]>("/roles"),
    ]).then(([d, g, r]) => {
      setDepartments(d.filter((x) => x.isActive));
      setJobGrades(g.filter((x) => x.isActive));
      setRoles(r.filter((x) => x.isActive));
    });
  }, []);

  // 수정 모드에서는 급여/연차일수를 관리자가 전부 볼 수 있어야 한다 — 입력창을 현재값으로
  // 채워서 보여주고(연차는 자동발생 배치가 입사일 기준으로 계산해둔 값), 직접 입력하지 않는 한
  // 그대로 저장돼도 새 이력이 남지 않는다.
  useEffect(() => {
    if (mode !== "edit" || !employee) return;
    api
      .get<{ currentSalary: number | null; currentYearGrantedDays: number }>(
        `/employees/${employee.employeeId}/compensation-leave-summary`,
      )
      .then((summary) => {
        setOriginalSalary(summary.currentSalary);
        setBaseSalary(summary.currentSalary != null ? String(summary.currentSalary) : "");
        setOriginalLeaveDays(summary.currentYearGrantedDays);
        setInitialLeaveDays(String(summary.currentYearGrantedDays));
      })
      .catch(() => {});
  }, [mode, employee]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
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
          employmentType,
          isOwnerOperator: jobType === "DELIVERY" ? isOwnerOperator : null,
          address: address || null,
          notes: notes || null,
          baseSalary: baseSalary ? Number(baseSalary) : undefined,
          initialLeaveDays: initialLeaveDays ? Number(initialLeaveDays) : undefined,
          employmentStatus,
        });
        setTempPassword(created.tempPassword ?? null);
        setIssuedId(created.employeeId);
      } else if (employee) {
        const newSalary = baseSalary ? Number(baseSalary) : null;
        const salaryChanged = newSalary != null && newSalary !== originalSalary;
        const leaveDelta = (initialLeaveDays ? Number(initialLeaveDays) : originalLeaveDays) - originalLeaveDays;

        const updated = await api.patch<Employee>(`/employees/${employee.employeeId}`, {
          departmentId,
          jobGradeId,
          hireDate,
          address: address || null,
          notes: notes || null,
          mobilePhone,
          extensionNumber: extensionNumber || null,
          roleId,
          jobType,
          employmentType,
          isOwnerOperator: jobType === "DELIVERY" ? isOwnerOperator : null,
          ...(canEditStatus ? { employmentStatus } : {}),
          ...(salaryChanged ? { baseSalary: newSalary } : {}),
          ...(leaveDelta !== 0 ? { additionalLeaveDays: leaveDelta } : {}),
        });
        onDone(updated);
      }
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSubmitting(false);
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={mode === "edit"}
            required
          />
        </label>
        {mode === "edit" && <p className="hint">이름은 등록 후에는 변경할 수 없습니다.</p>}
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
        {jobType === "DELIVERY" && (
          <label>
            지입 여부
            <select
              value={isOwnerOperator ? "Y" : "N"}
              onChange={(e) => setIsOwnerOperator(e.target.value === "Y")}
            >
              <option value="N">N</option>
              <option value="Y">Y</option>
            </select>
          </label>
        )}
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
        {mode === "edit" && (
          <label>
            급여 (원)
            <input
              type="number"
              min="0"
              step="1"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              placeholder="현재 급여 이력 없음"
            />
          </label>
        )}
        {mode === "edit" && (
          <label>
            연차일수 (올해 발생 기준)
            <input
              type="number"
              min="0"
              step="0.5"
              value={initialLeaveDays}
              onChange={(e) => setInitialLeaveDays(e.target.value)}
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
          고용형태
          <select
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
          >
            {(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((et) => (
              <option key={et} value={et}>
                {EMPLOYMENT_TYPE_LABEL[et]}
              </option>
            ))}
          </select>
        </label>
        <label>
          휴대폰번호
          <input
            value={mobilePhone}
            onChange={(e) => setMobilePhone(formatPhoneNumber(e.target.value))}
            placeholder="010-0000-0000"
            required
          />
        </label>
        <label>
          내선번호
          <input
            value={extensionNumber}
            onChange={(e) => setExtensionNumber(formatPhoneNumber(e.target.value))}
          />
        </label>
        <label>
          권한
          <select value={roleId ?? 0} onChange={(e) => setRoleId(Number(e.target.value))} required>
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
        <label>
          기타
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="특이사항을 자유롭게 적어주세요"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? (mode === "create" ? "등록 중..." : "저장 중...") : mode === "create" ? "등록" : "저장"}
          </button>
          <button type="button" onClick={() => onDone()} disabled={submitting}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
