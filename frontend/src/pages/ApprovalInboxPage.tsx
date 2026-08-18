import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ApprovalDocumentDetailModal } from "../components/ApprovalDocumentDetailModal";
import type { ApprovalInboxItem } from "../types";

export function ApprovalInboxPage() {
  const [scope, setScope] = useState<"pending" | "done">("pending");
  const [items, setItems] = useState<ApprovalInboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function load() {
    api
      .get<ApprovalInboxItem[]>(`/approval/documents/inbox?scope=${scope}`)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, [scope]);

  return (
    <section>
      <h2>
        결재함
        <span className="help-icon">
          ?
          <span className="help-icon-tooltip">
            {scope === "pending" ? "내가 지금 결재할 차례인 문서 목록입니다." : "내가 이미 결재한 문서 목록입니다."}
          </span>
        </span>
      </h2>

      <div className="seg" style={{ display: "inline-flex", marginBottom: 16 }}>
        <label className="seg-opt">
          <input
            type="radio"
            checked={scope === "pending"}
            onChange={() => setScope("pending")}
          />
          <span>결재 대기</span>
        </label>
        <label className="seg-opt">
          <input type="radio" checked={scope === "done"} onChange={() => setScope("done")} />
          <span>처리 완료</span>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 && (
          <p className="hint" style={{ padding: 16 }}>
            {scope === "pending" ? "결재 대기 중인 문서가 없습니다." : "처리한 문서가 없습니다."}
          </p>
        )}
        {items.map((item) => (
          <div
            key={`${item.documentId}-${item.stepOrder}`}
            className="approval-inbox-card"
            style={{ borderBottom: "1px solid var(--border-soft)" }}
          >
            <div className="approval-inbox-card-main">
              <span className="avatar">{item.drafter.name.charAt(0)}</span>
              <div className="approval-inbox-card-info">
                <span className="approval-inbox-card-title">{item.title}</span>
                <span className="hint">
                  {item.drafter.name} · {item.documentType === "LEAVE" ? "연차 신청" : "일반 기안"} ·{" "}
                  {item.createdAt}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="status-tag status-tag--pending">{item.stepOrder}차 결재</span>
              <button type="button" onClick={() => setSelectedId(item.documentId)}>
                {scope === "pending" ? "검토하기" : "상세"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedId != null && (
        <ApprovalDocumentDetailModal
          documentId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </section>
  );
}
