import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { JobGrade } from "../types";

export function ReferenceDataPage() {
  const [jobGrades, setJobGrades] = useState<JobGrade[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  function load() {
    api.get<JobGrade[]>("/job-grades").then(setJobGrades).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/job-grades", { name, sortOrder: jobGrades.length });
      setName("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(jobGrade: JobGrade) {
    await api.patch(`/job-grades/${jobGrade.id}`, { isActive: !jobGrade.isActive });
    load();
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(targetId: number) {
    if (draggedId == null || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const fromIndex = jobGrades.findIndex((g) => g.id === draggedId);
    const toIndex = jobGrades.findIndex((g) => g.id === targetId);
    setDraggedId(null);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...jobGrades];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setJobGrades(reordered);

    const changed = reordered
      .map((g, index) => ({ g, index }))
      .filter(({ g, index }) => g.sortOrder !== index);
    await Promise.all(
      changed.map(({ g, index }) => api.patch(`/job-grades/${g.id}`, { sortOrder: index })),
    );
    load();
  }

  return (
    <section>
      <h2>직급 관리</h2>
      <p className="hint">
        직급 체계가 바뀌어도 기존 직원 데이터가 깨지지 않도록, 삭제 대신 비활성화로 관리합니다.
        행을 드래그해서 순서를 바꿀 수 있습니다.
      </p>

      <form onSubmit={handleCreate} className="inline-form">
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={loading}>
          직급 추가
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th></th>
            <th>직급</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobGrades.map((g) => (
            <tr
              key={g.id}
              draggable
              onDragStart={() => setDraggedId(g.id)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(g.id)}
              onDragEnd={() => setDraggedId(null)}
              style={{ opacity: draggedId === g.id ? 0.4 : 1, cursor: "grab" }}
            >
              <td aria-hidden="true">⠿</td>
              <td>{g.name}</td>
              <td>{g.isActive ? "사용중" : "비활성"}</td>
              <td>
                <button type="button" onClick={() => toggleActive(g)}>
                  {g.isActive ? "비활성화" : "다시 사용"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
