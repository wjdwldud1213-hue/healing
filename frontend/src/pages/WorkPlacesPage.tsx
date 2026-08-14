import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { WorkPlace } from "../types";

export function WorkPlacesPage() {
  const [workPlaces, setWorkPlaces] = useState<WorkPlace[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [radiusM, setRadiusM] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    api
      .get<WorkPlace[]>("/work-places?includeInactive=true")
      .then(setWorkPlaces)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/work-places", { name, address, radiusM: Number(radiusM) });
      setName("");
      setAddress("");
      setRadiusM("100");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(place: WorkPlace) {
    await api.patch(`/work-places/${place.id}`, { isActive: !place.isActive });
    load();
  }

  return (
    <section>
      <h2>근무지 관리</h2>
      <p className="hint">
        입력한 주소를 좌표로 자동 변환해 사무직·배송직 출근 시 위치를 검증합니다. 삭제 대신
        비활성화로 관리합니다.
      </p>

      <div className="card">
        <h3>근무지 추가</h3>
        <form onSubmit={handleCreate} className="stacked-form">
          <label>
            지점명
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            주소
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="도로명 또는 지번 주소"
              required
            />
          </label>
          <label>
            반경 (m)
            <input
              type="number"
              min="1"
              step="1"
              value={radiusM}
              onChange={(e) => setRadiusM(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={loading}>
              등록
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>근무지 목록</h3>
        <table>
          <thead>
            <tr>
              <th>지점명</th>
              <th>주소</th>
              <th>반경(m)</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {workPlaces.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.address}</td>
                <td>{p.radiusM}</td>
                <td>{p.isActive ? "사용중" : "비활성"}</td>
                <td>
                  <button type="button" onClick={() => toggleActive(p)}>
                    {p.isActive ? "비활성화" : "다시 사용"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
