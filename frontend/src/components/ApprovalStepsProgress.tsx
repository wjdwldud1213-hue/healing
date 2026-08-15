import type { ApprovalStep } from "../types";

const STEP_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

// 결재 단계 진행 상태를 원형 인디케이터 + 연결선으로 보여준다. stepOrder는 문서마다 1부터
// 연속일 필요가 없다 — 부서 최고직급자가 기안해 1차가 생략된 문서는 stepOrder=2(2차/최종)
// 단계 하나만 존재하며, 이 경우 맨 앞에 "1차: /" 자리를 하나 더 그려서 생략됐음을 보여준다.
export function ApprovalStepsProgress({ steps }: { steps: ApprovalStep[] }) {
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const missingFirstSlot = sorted.length > 0 && sorted[0].stepOrder > 1;

  return (
    <div className="step-progress">
      {missingFirstSlot && (
        <div className="step-progress-item">
          <div className="step-progress-node step-progress-node--empty">
            <span className="step-progress-circle">/</span>
            <span className="step-progress-label">1차</span>
            <span className="hint">해당없음</span>
          </div>
        </div>
      )}
      {sorted.map((step, idx) => (
        <div className="step-progress-item" key={step.id}>
          {(idx > 0 || missingFirstSlot) && <span className="step-progress-line" />}
          <div className={`step-progress-node step-progress-node--${step.status.toLowerCase()}`}>
            <span className="step-progress-circle">
              {step.status === "APPROVED" ? "✓" : step.status === "REJECTED" ? "✕" : step.stepOrder}
            </span>
            <span className="step-progress-label">{step.approver.name}</span>
            <span className={`status-tag status-tag--${step.status.toLowerCase()}`}>
              {STEP_STATUS_LABEL[step.status]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
