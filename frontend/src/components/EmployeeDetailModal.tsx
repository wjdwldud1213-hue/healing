import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Employee, EmploymentStatus, EmploymentType, JobType, MaskableEmployee } from "../types";

const STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: "재직",
  LEAVE: "휴직",
  RESIGNED: "퇴사",
};

const JOB_TYPE_LABEL: Record<JobType, string> = {
  OFFICE: "사무직",
  DELIVERY: "배송직",
  SALES: "영업직",
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  REGULAR: "정규직",
  CONTRACT: "계약직",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <p>
      <b>{label}</b> {value ?? <span className="hint">🔒 잠김</span>}
    </p>
  );
}

// EMPLOYEE_WRITE 권한이 없는 조회자용 읽기 전용 상세보기. 이름/부서/직급/직군/내선번호를
// 제외한 필드는 서버가 마스킹(null)해서 내려주므로, 그 직원의 조회용 비밀번호(PIN)를
// 맞혀야만 이 자리에서 실제 값으로 바뀐다.
export function EmployeeDetailModal({
  employee,
  onClose,
}: {
  employee: MaskableEmployee;
  onClose: () => void;
}) {
  const [unlocked, setUnlocked] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const shown = unlocked ?? employee;
  const isLocked = shown.hireDate == null;

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<Employee>(`/employees/${employee.employeeId}/unlock`, { pin });
      setUnlocked(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>직원 상세 — {employee.employeeId}</h3>
      <Field label="이름" value={employee.name} />
      <Field label="부서" value={employee.department.name} />
      <Field label="직급" value={employee.jobGrade.name} />
      <Field label="직군" value={JOB_TYPE_LABEL[employee.jobType]} />
      {employee.jobType === "DELIVERY" && (
        <Field label="지입 여부" value={shown.isOwnerOperator == null ? null : shown.isOwnerOperator ? "Y" : "N"} />
      )}
      <Field label="내선번호" value={employee.extensionNumber ?? "-"} />
      <Field label="입사일" value={shown.hireDate} />
      <Field label="재직상태" value={shown.employmentStatus ? STATUS_LABEL[shown.employmentStatus] : null} />
      <Field label="고용형태" value={shown.employmentType ? EMPLOYMENT_TYPE_LABEL[shown.employmentType] : null} />
      <Field label="휴대폰번호" value={shown.mobilePhone} />
      <Field label="주소" value={shown.address} />
      <Field label="권한" value={shown.role?.name ?? null} />

      {isLocked && (
        <form onSubmit={handleUnlock} className="stacked-form">
          <p className="hint">
            🔒 표시된 항목은 개인정보라 가려져 있습니다. 해당 직원의 조회용 비밀번호(PIN)를
            입력하면 볼 수 있습니다.
          </p>
          <label>
            조회용 비밀번호(PIN)
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={loading}>
              {loading ? "확인 중..." : "잠금 해제"}
            </button>
          </div>
        </form>
      )}

      <div className="form-actions">
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
