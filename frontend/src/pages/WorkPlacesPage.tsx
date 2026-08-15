import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import type { WorkPlace } from "../types";

// Daum(카카오) 우편번호 서비스 — API 키 없이 쓸 수 있는 공개 위젯. window.open 기반 팝업 창은
// 브라우저 팝업 차단에 걸릴 수 있어서, 대신 모달 안에 embed()로 검색 UI를 내장한다.
declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: { address: string; roadAddress: string }) => void;
      }) => { embed: (el: HTMLElement) => void };
    };
  }
}

const DAUM_POSTCODE_SCRIPT_ID = "daum-postcode-script";
const DAUM_POSTCODE_SCRIPT_SRC = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

export function WorkPlacesPage() {
  const [workPlaces, setWorkPlaces] = useState<WorkPlace[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [radiusM, setRadiusM] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const postcodeContainerRef = useRef<HTMLDivElement>(null);

  function load() {
    api
      .get<WorkPlace[]>("/work-places?includeInactive=true")
      .then(setWorkPlaces)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  useEffect(() => {
    if (document.getElementById(DAUM_POSTCODE_SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = DAUM_POSTCODE_SCRIPT_ID;
    script.src = DAUM_POSTCODE_SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // 모달이 열려서 embed 대상 div가 실제로 DOM에 마운트된 뒤에 embed()를 호출해야 한다.
  useEffect(() => {
    if (!showAddressSearch || !postcodeContainerRef.current) return;
    if (!window.daum?.Postcode) {
      setError("주소 검색을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      setShowAddressSearch(false);
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        setAddress(data.roadAddress || data.address);
        setShowAddressSearch(false);
      },
    }).embed(postcodeContainerRef.current);
  }, [showAddressSearch]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/work-places", { name, address, radiusM: Number(radiusM) });
      setName("");
      setAddress("");
      setRadiusM("");
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
            근무지
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            주소
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="도로명 또는 지번 주소"
                required
                style={{ flex: 1 }}
              />
              <button type="button" onClick={() => setShowAddressSearch(true)}>
                주소 검색
              </button>
            </div>
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
              <th>근무지</th>
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

      {showAddressSearch && (
        <Modal onClose={() => setShowAddressSearch(false)}>
          <div className="card">
            <h3>주소 검색</h3>
            <div ref={postcodeContainerRef} style={{ width: "100%", height: "450px" }} />
          </div>
        </Modal>
      )}
    </section>
  );
}
