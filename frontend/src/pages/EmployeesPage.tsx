import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Department, Employee, EmploymentStatus } from "../types";
import { EmployeeForm } from "../components/EmployeeForm";
import { Modal } from "../components/Modal";

const STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: "재직",
  LEAVE: "휴직",
  RESIGNED: "퇴사",
};

// 이 화면은 App.tsx에서 EMPLOYEE_WRITE 권한자만 접근하도록 라우트 자체가 막혀 있다
// (부서관리자 포함 그 외 권한은 완전히 접근 불가 — 인력 구조 조회는 조직도를 대신 이용한다).
export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<EmploymentStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"none" | "create" | "edit">("none");
  const [editing, setEditing] = useState<Employee | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (departmentFilter) params.set("departmentId", String(departmentFilter));
    if (statusFilter) params.set("status", statusFilter);
    api
      .get<Employee[]>(`/employees?${params.toString()}`)
      .then(setEmployees)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, [departmentFilter, statusFilter]);
  useEffect(() => {
    api.get<Department[]>("/departments").then(setDepartments);
  }, []);

  async function handleResign(employee: Employee) {
    if (!confirm(`${employee.name}(${employee.employeeId}) 님을 퇴사 처리할까요?`)) return;
    await api.post(`/employees/${employee.employeeId}/resign`);
    load();
  }

  return (
    <section>
      <h2>직원 관리</h2>

      <div className="toolbar">
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">부서별</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter((e.target.value || "") as EmploymentStatus | "")}
        >
          <option value="">재직상태</option>
          <option value="ACTIVE">재직</option>
          <option value="LEAVE">휴직</option>
          <option value="RESIGNED">퇴사</option>
        </select>
        <button
          type="button"
          className="toolbar-end"
          onClick={() => {
            setEditing(null);
            setFormMode("create");
          }}
        >
          직원 추가
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>사번</th>
            <th>이름</th>
            <th>부서</th>
            <th>직급</th>
            <th>재직상태</th>
            <th>내선번호</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.employeeId}>
              <td>{emp.employeeId}</td>
              <td>{emp.name}</td>
              <td>{emp.department.name}</td>
              <td>{emp.jobGrade.name}</td>
              <td>{STATUS_LABEL[emp.employmentStatus]}</td>
              <td>{emp.extensionNumber ?? "-"}</td>
              <td className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(emp);
                    setFormMode("edit");
                  }}
                >
                  수정
                </button>
                {emp.employmentStatus !== "RESIGNED" && (
                  <button type="button" onClick={() => handleResign(emp)}>
                    퇴사처리
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {formMode !== "none" && (
        <Modal onClose={() => setFormMode("none")}>
          <EmployeeForm
            mode={formMode}
            employee={editing ?? undefined}
            onDone={() => {
              setFormMode("none");
              load();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
