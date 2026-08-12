import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Department, Employee, EmploymentStatus } from "../types";
import { EmployeeForm } from "../components/EmployeeForm";
import { useAuth } from "../auth/AuthContext";

const STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: "재직",
  LEAVE: "휴직",
  RESIGNED: "퇴사",
};

export function EmployeesPage() {
  const { currentUser } = useAuth();
  const canWrite = currentUser?.permissions?.includes("EMPLOYEE_WRITE") ?? false;
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
          <option value="">전체 부서</option>
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
          <option value="">전체 상태</option>
          <option value="ACTIVE">재직</option>
          <option value="LEAVE">휴직</option>
          <option value="RESIGNED">퇴사</option>
        </select>
        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormMode("create");
            }}
          >
            새 직원 등록
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>사번</th>
            <th>이름</th>
            <th>부서</th>
            <th>직급</th>
            <th>상태</th>
            <th>휴대폰</th>
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
              <td>{emp.mobilePhone}</td>
              <td className="row-actions">
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(emp);
                      setFormMode("edit");
                    }}
                  >
                    수정
                  </button>
                )}
                {canWrite && emp.employmentStatus !== "RESIGNED" && (
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
        <EmployeeForm
          mode={formMode}
          employee={editing ?? undefined}
          onDone={() => {
            setFormMode("none");
            load();
          }}
        />
      )}
    </section>
  );
}
