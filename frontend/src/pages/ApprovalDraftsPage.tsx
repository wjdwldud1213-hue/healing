import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { ApprovalLinePicker } from "../components/ApprovalLinePicker";
import type { ApprovalLineItem } from "../components/ApprovalLinePicker";
import { ApprovalDocumentDetailModal } from "../components/ApprovalDocumentDetailModal";
import type { ApprovalDocument, RecommendedApprovalStep } from "../types";

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "결재 진행중",
  APPROVED: "승인 완료",
  REJECTED: "반려",
  CANCELED: "기안 취소",
};

export function ApprovalDraftsPage() {
  const [documents, setDocuments] = useState<ApprovalDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function load() {
    api
      .get<ApprovalDocument[]>("/approval/documents/drafts")
      .then(setDocuments)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  return (
    <section>
      <h2>기안함</h2>
      <p className="hint">내가 작성한 결재 문서 목록입니다.</p>

      <div className="toolbar">
        <button type="button" className="toolbar-end" onClick={() => setShowComposeModal(true)}>
          새 기안
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        {documents.length === 0 && <p className="hint">기안한 문서가 없습니다.</p>}
        {documents.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>유형</th>
                <th>상태</th>
                <th>기안일</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.documentType === "LEAVE" ? "연차 신청" : "일반 기안"}</td>
                  <td>
                    <span className={`status-tag status-tag--${d.status.toLowerCase()}`}>
                      {DOCUMENT_STATUS_LABEL[d.status]}
                    </span>
                  </td>
                  <td>{d.createdAt}</td>
                  <td>
                    <button type="button" onClick={() => setSelectedId(d.id)}>
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showComposeModal && (
        <ComposeModal
          onClose={() => setShowComposeModal(false)}
          onCreated={() => {
            setShowComposeModal(false);
            load();
          }}
        />
      )}

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

function toLineItems(slots: RecommendedApprovalStep[]): ApprovalLineItem[] {
  return slots.filter((s) => s.approver).map((s) => ({ stepOrder: s.stepOrder, approver: s.approver! }));
}

function ComposeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [lineItems, setLineItems] = useState<ApprovalLineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get<RecommendedApprovalStep[]>("/approval/recommend-line")
      .then((slots) => setLineItems(toLineItems(slots)))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (lineItems.length === 0) {
      setError("결재선을 1명 이상 지정하세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.post("/approval/documents", {
        documentType: "GENERAL",
        title,
        content: content || undefined,
        steps: lineItems.map((i) => ({ stepOrder: i.stepOrder, approverId: i.approver.employeeId })),
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="card">
        <h3>새 기안</h3>
        <form onSubmit={handleSubmit} className="stacked-form" style={{ maxWidth: 480 }}>
          <label>
            제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            내용
            <textarea
              className="input"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          <div className="field">
            <label>결재선</label>
            <ApprovalLinePicker items={lineItems} onChange={setLineItems} />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={loading}>
              결재 요청
            </button>
            <button type="button" onClick={onClose}>
              취소
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
