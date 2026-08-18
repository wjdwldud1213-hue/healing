import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ApprovalDocumentDetailModal } from "../components/ApprovalDocumentDetailModal";
import type { ApprovalDocument } from "../types";

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "결재 진행중",
  APPROVED: "승인 완료",
  REJECTED: "반려",
  CANCELED: "기안 취소",
};

// 상무 이상 직급만 접근 가능(백엔드에서도 재확인함). 전사 모든 결재문서를 열람 전용으로 보여준다.
export function ApprovalAllDocumentsPage() {
  const [documents, setDocuments] = useState<ApprovalDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function load() {
    api
      .get<ApprovalDocument[]>("/approval/documents/all")
      .then(setDocuments)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  return (
    <section>
      <h2>
        전체 문서함
        <span className="help-icon">
          ?
          <span className="help-icon-tooltip">
            전사의 모든 결재 문서를 열람할 수 있습니다 (승인/반려는 결재선에 지정된 사람만 가능합니다).
          </span>
        </span>
      </h2>

      {error && <p className="error">{error}</p>}

      <div className="card">
        {documents.length === 0 && <p className="hint">문서가 없습니다.</p>}
        {documents.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>유형</th>
                <th>기안자</th>
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
                  <td>{d.drafter.name}</td>
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
