import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Department, Employee } from "../types";

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(targetId: number) {
    if (draggedId == null || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const fromIndex = departments.findIndex((d) => d.id === draggedId);
    const toIndex = departments.findIndex((d) => d.id === targetId);
    setDraggedId(null);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...departments];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDepartments(reordered);

    const changed = reordered
      .map((d, index) => ({ d, index }))
      .filter(({ d, index }) => d.sortOrder !== index);
    await Promise.all(
      changed.map(({ d, index }) => api.patch(`/departments/${d.id}`, { sortOrder: index })),
    );
    load();
  }

  return (
    <section>
      <h2>부서 관리</h2>
      <p className="hint">
        부서코드는 A~Z 중 한 글자만 배정할 수 있고, 한 번 쓰면 다른 부서에 다시 배정할 수
        없습니다. (이미 발급된 사번의 의미가 바뀌지 않도록 하기 위함) 행을 드래그해서 순서를
        바꿀 수 있습니다.
      </p>

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
            <tr
              key={d.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDraggedId(d.id);
              }}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(d.id)}
              onDragEnd={() => setDraggedId(null)}
              style={{ opacity: draggedId === d.id ? 0.4 : 1, cursor: "grab" }}
            >
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
              <td aria-hidden="true">⠿</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
