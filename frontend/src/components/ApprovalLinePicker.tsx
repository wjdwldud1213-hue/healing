import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ApproverCandidate } from "../types";

export type ApprovalLineItem = { stepOrder: number; approver: ApproverCandidate };

type Props = {
  items: ApprovalLineItem[];
  onChange: (items: ApprovalLineItem[]) => void;
  /** true면 검색/추가/삭제/순서변경 컨트롤 없이 미리보기만 보여준다 (연차 신청처럼 편집 UI가 없는 화면용). */
  readOnly?: boolean;
};

// 결재선을 표시/편집하는 공용 위젯. 기안자와 같은 부서 최고직급자가 1차, 물류부는 상무·그 외는
// 실장이 2차(최종)로 자동 추천되며, 기안자 본인이 부서 최고직급자면 1차 슬롯 자체가 없다 —
// 이 경우 맨 앞에 "1차: /(해당없음)" 행을 하나 더 보여준다.
export function ApprovalLinePicker({ items, onChange, readOnly = false }: Props) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ApproverCandidate[]>([]);

  useEffect(() => {
    if (readOnly) return;
    const q = query.trim();
    if (!q) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<ApproverCandidate[]>(`/approval/approver-candidates?q=${encodeURIComponent(q)}`)
        .then(setCandidates)
        .catch(() => setCandidates([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, readOnly]);

  const sorted = [...items].sort((a, b) => a.stepOrder - b.stepOrder);
  const missingFirstSlot = sorted.length > 0 && sorted[0].stepOrder > 1;

  function addCandidate(c: ApproverCandidate) {
    if (sorted.some((i) => i.approver.employeeId === c.employeeId)) return;
    const nextOrder = sorted.length ? sorted[sorted.length - 1].stepOrder + 1 : 1;
    onChange([...sorted, { stepOrder: nextOrder, approver: c }]);
    setQuery("");
    setCandidates([]);
  }

  function removeAt(idx: number) {
    onChange(sorted.filter((_, i) => i !== idx));
  }

  // 순서를 바꿀 때는 두 자리(stepOrder)의 결재자만 맞바꾼다 — 슬롯 번호 자체는 그대로 유지된다.
  function swap(idxA: number, idxB: number) {
    const next = [...sorted];
    const orderA = next[idxA].stepOrder;
    next[idxA] = { ...next[idxA], stepOrder: next[idxB].stepOrder };
    next[idxB] = { ...next[idxB], stepOrder: orderA };
    onChange(next);
  }

  return (
    <div className="approval-line-picker">
      <div className="approval-line-list">
        {missingFirstSlot && (
          <div className="approval-line-item approval-line-item--empty">
            <span className="avatar">/</span>
            <span className="approval-line-info">
              <span className="approval-line-name">1차 결재 (해당없음)</span>
              <span className="hint">부서 내 최고직급자라 1차가 생략됩니다</span>
            </span>
          </div>
        )}
        {sorted.length === 0 && !missingFirstSlot && (
          <p className="hint">추천할 결재자가 없습니다. 아래에서 직접 지정하세요.</p>
        )}
        {sorted.map((item, idx) => (
          <div className="approval-line-item" key={item.approver.employeeId}>
            <span className="avatar">{item.approver.name.charAt(0)}</span>
            <span className="approval-line-info">
              <span className="approval-line-name">{item.approver.name}</span>
              <span className="hint">
                {idx === sorted.length - 1 ? `${item.stepOrder}차(최종) 결재` : `${item.stepOrder}차 결재`} ·{" "}
                {item.approver.departmentName} {item.approver.jobGradeName}
              </span>
            </span>
            <span className="status-tag status-tag--pending">대기</span>
            {!readOnly && (
              <div className="row-actions">
                <button type="button" onClick={() => swap(idx, idx - 1)} disabled={idx === 0}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => swap(idx, idx + 1)}
                  disabled={idx === sorted.length - 1}
                >
                  ↓
                </button>
                <button type="button" onClick={() => removeAt(idx)}>
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="approval-line-search">
          <input
            placeholder="결재자 검색 (이름)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {candidates.length > 0 && (
            <ul className="approval-candidate-list">
              {candidates.map((c) => (
                <li key={c.employeeId}>
                  <button type="button" onClick={() => addCandidate(c)}>
                    {c.name} · {c.departmentName} {c.jobGradeName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
