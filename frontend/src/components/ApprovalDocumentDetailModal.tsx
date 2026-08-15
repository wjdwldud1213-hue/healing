import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./Modal";
import { ApprovalStepsProgress } from "./ApprovalStepsProgress";
import type { ApprovalDocumentDetail } from "../types";

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "결재 진행중",
  APPROVED: "승인 완료",
  REJECTED: "반려",
  CANCELED: "기안 취소",
};

type Props = {
  documentId: number;
  onClose: () => void;
  /** 승인/반려/취소가 성공적으로 반영된 뒤 호출된다 — 목록 화면이 재조회하도록 알려준다. */
  onChanged: () => void;
};

export function ApprovalDocumentDetailModal({ documentId, onClose, onChanged }: Props) {
  const { currentUser } = useAuth();
  const [detail, setDetail] = useState<ApprovalDocumentDetail | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .get<ApprovalDocumentDetail>(`/approval/documents/${documentId}`)
      .then(setDetail)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, [documentId]);

  const currentStep = detail?.steps.find((s) => s.stepOrder === detail.currentStepOrder) ?? null;
  const canAct =
    !!detail &&
    detail.status === "IN_PROGRESS" &&
    currentStep?.status === "PENDING" &&
    currentStep.approverId === currentUser?.employeeId;

  const firstStep = detail ? [...detail.steps].sort((a, b) => a.stepOrder - b.stepOrder)[0] : null;
  const canCancel =
    !!detail &&
    detail.drafterId === currentUser?.employeeId &&
    detail.status === "IN_PROGRESS" &&
    firstStep?.status === "PENDING";

  async function handleDecision(action: "approve" | "reject") {
    if (!detail || !currentStep) return;
    if (action === "reject" && !comment.trim()) {
      setError("반려 시에는 사유를 입력하세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(`/approval/documents/${detail.id}/steps/${currentStep.stepOrder}/${action}`, {
        comment: comment.trim() || undefined,
      });
      setComment("");
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!detail) return;
    setError(null);
    setBusy(true);
    try {
      await api.post(`/approval/documents/${detail.id}/cancel`);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="card">
        {!detail && !error && <p className="hint">불러오는 중...</p>}
        {error && <p className="error">{error}</p>}
        {detail && (
          <>
            <div className="section-header">
              <div>
                <h3 style={{ marginBottom: 4 }}>{detail.title}</h3>
                <span className="hint">
                  {detail.documentType === "LEAVE" ? "연차 신청" : "일반 기안"} · 기안자{" "}
                  {detail.drafter.name}
                </span>
              </div>
              <span className={`status-tag status-tag--${detail.status.toLowerCase()}`}>
                {DOCUMENT_STATUS_LABEL[detail.status]}
              </span>
            </div>

            {detail.documentType === "LEAVE" && detail.leave && (
              <dl className="approval-detail-grid">
                <div>
                  <dt>기간</dt>
                  <dd>
                    {detail.leave.startDate} ~ {detail.leave.endDate}
                  </dd>
                </div>
                <div>
                  <dt>일수</dt>
                  <dd>{detail.leave.days}일</dd>
                </div>
                <div>
                  <dt>사유</dt>
                  <dd>{detail.leave.reason ?? "-"}</dd>
                </div>
              </dl>
            )}
            {detail.documentType === "GENERAL" && detail.content && (
              <p style={{ whiteSpace: "pre-wrap" }}>{detail.content}</p>
            )}

            <h4 style={{ marginTop: 16, marginBottom: 4 }}>결재 진행 현황</h4>
            <ApprovalStepsProgress steps={detail.steps} />

            {detail.steps.some((s) => s.comment) && (
              <div style={{ marginTop: 8 }}>
                {detail.steps
                  .filter((s) => s.comment)
                  .map((s) => (
                    <p key={s.id} className="hint">
                      {s.approver.name}: {s.comment}
                    </p>
                  ))}
              </div>
            )}

            {canAct && (
              <div className="field" style={{ marginTop: 16 }}>
                <label>
                  결재 의견 (반려 시 필수)
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="input"
                  />
                </label>
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <div className="form-actions" style={{ marginTop: 12 }}>
              {canAct && (
                <>
                  <button type="button" disabled={busy} onClick={() => handleDecision("reject")}>
                    반려
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDecision("approve")}
                  >
                    승인
                  </button>
                </>
              )}
              {canCancel && (
                <button type="button" disabled={busy} onClick={handleCancel}>
                  기안 취소
                </button>
              )}
              <button type="button" onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
