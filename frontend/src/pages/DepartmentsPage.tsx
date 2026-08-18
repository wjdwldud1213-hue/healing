import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useDragReorder } from "../lib/dragReorder";
import type { Department, Employee } from "../types";

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    api.get<Department[]>("/departments").then(setDepartments).catch((e) => setError(e.message));
  }

  useEffect(load, []);
  useEffect(() => {
    api
      .get<Employee[]>("/employees")
      .then((rows) => setEmployees(rows.filter((e) => e.employmentStatus !== "RESIGNED")))
      .catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/departments", { code, name, sortOrder: departments.length });
      setCode("");
      setName("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(dept: Department) {
    await api.patch(`/departments/${dept.id}`, { isActive: !dept.isActive });
    load();
  }

  async function handleManagerChange(dept: Department, managerId: string) {
    await api.patch(`/departments/${dept.id}`, { managerId: managerId || null });
    load();
  }

  const { draggedId, handleDragHandleMouseDown } = useDragReorder(departments, setDepartments, async (changed) => {
    await Promise.all(changed.map((c) => api.patch(`/departments/${c.id}`, { sortOrder: c.sortOrder })));
    load();
  });

  return (
    <section>
      <h2>
        부서 관리
        <span className="help-icon">
          ?
          <span className="help-icon-tooltip">
            부서코드는 A~Z 중 한 글자만 배정할 수 있고, 한 번 쓰면 다른 부서에 다시 배정할 수
            없습니다. (이미 발급된 사번의 의미가 바뀌지 않도록 하기 위함) ⠿ 아이콘을 드래그해서
            순서를 바꿀 수 있습니다.
          </span>
        </span>
      </h2>

      <form onSubmit={handleCreate} className="inline-form">
        <input
          placeholder="코드 (예: A)"
          value={code}
          maxLength={1}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <input placeholder="부서명" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={loading}>
          부서 추가
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>코드</th>
            <th>부서명</th>
            <th>담당 임원</th>
            <th>상태</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {departments.map((d) => (
            <tr key={d.id} data-drag-id={d.id} style={{ opacity: draggedId === d.id ? 0.4 : 1 }}>
              <td>{d.code}</td>
              <td>{d.name}</td>
              <td>
                <select
                  value={d.managerId ?? ""}
                  onChange={(e) => handleManagerChange(d, e.target.value)}
                >
                  <option value="">미지정</option>
                  {employees.map((emp) => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.name} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              </td>
              <td>{d.isActive ? "사용중" : "비활성"}</td>
              <td>
                <button type="button" onClick={() => toggleActive(d)}>
                  {d.isActive ? "비활성화" : "다시 사용"}
                </button>
              </td>
              <td
                aria-hidden="true"
                onMouseDown={handleDragHandleMouseDown(d.id)}
                style={{ cursor: "grab", userSelect: "none" }}
              >
                ⠿
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
