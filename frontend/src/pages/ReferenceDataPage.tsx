import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { JobGrade } from "../types";

function CodeTableEditor({ title, path }: { title: string; path: "/job-grades" | "/job-titles" }) {
  const [items, setItems] = useState<JobGrade[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<JobGrade[]>(path).then(setItems).catch((e) => setError(e.message));
  }

  useEffect(load, [path]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(path, { name, sortOrder: items.length });
      setName("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleActive(item: JobGrade) {
    await api.patch(`${path}/${item.id}`, { isActive: !item.isActive });
    load();
  }

  return (
    <div className="card">
      <h3>{title}</h3>
      <form onSubmit={handleCreate} className="inline-form">
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">추가</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="chip-list">
        {items.map((item) => (
          <li key={item.id} className={item.isActive ? "" : "inactive"}>
            {item.name}
            <button type="button" onClick={() => toggleActive(item)}>
              {item.isActive ? "비활성화" : "다시 사용"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReferenceDataPage() {
  return (
    <section>
      <h2>직급 / 직책 관리</h2>
      <p className="hint">
        직급/직책 체계가 바뀌어도 기존 직원 데이터가 깨지지 않도록, 삭제 대신 비활성화로
        관리합니다.
      </p>
      <div className="grid-2">
        <CodeTableEditor title="직급" path="/job-grades" />
        <CodeTableEditor title="직책" path="/job-titles" />
      </div>
    </section>
  );
}
