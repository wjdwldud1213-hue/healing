import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { JobGrade } from "../types";

export function ReferenceDataPage() {
  const [jobGrades, setJobGrades] = useState<JobGrade[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <section>
      <h2>직급 관리</h2>
      <p className="hint">
        직급 체계가 바뀌어도 기존 직원 데이터가 깨지지 않도록, 삭제 대신 비활성화로 관리합니다.
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
            <th>직급</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobGrades.map((g) => (
            <tr key={g.id}>
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
