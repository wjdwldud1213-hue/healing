import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { ApprovalLinePicker } from "../components/ApprovalLinePicker";
import type { ApprovalLineItem } from "../components/ApprovalLinePicker";
import { ApprovalDocumentDetailModal } from "../components/ApprovalDocumentDetailModal";
import { useAuth } from "../auth/AuthContext";
import type { LeaveBalance, LeaveRequest, RecommendedApprovalStep } from "../types";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "신청중",
  APPROVED: "승인",
  REJECTED: "반려",
};

// 시작일~종료일(포함) 사이 일수를 달력일 기준으로 계산한다. 반차 등 수동 조정은 신청 폼에서 직접 고칠 수 있다.
function calcInclusiveDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.round((e - s) / 86400000) + 1;
}

export function LeaveManagementPage() {
  const { currentUser } = useAuth();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showBasisModal, setShowBasisModal] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [approvalLine, setApprovalLine] = useState<ApprovalLineItem[]>([]);

  function load() {
    api.get<LeaveBalance[]>("/leave/balance").then(setBalances).catch((e) => setError(e.message));
    api.get<LeaveRequest[]>("/leave/requests").then(setRequests).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  function handleStartDateChange(value: string) {
    setStartDate(value);
    const calculated = calcInclusiveDays(value, endDate);
    if (calculated != null) setDays(String(calculated));
  }

  function handleEndDateChange(value: string) {
    setEndDate(value);
    const calculated = calcInclusiveDays(startDate, value);
    if (calculated != null) setDays(String(calculated));
  }

  function openApplyModal() {
    setShowApplyModal(true);
    api
      .get<RecommendedApprovalStep[]>("/approval/recommend-line")
      .then((slots) =>
        setApprovalLine(
          slots.filter((s) => s.approver).map((s) => ({ stepOrder: s.stepOrder, approver: s.approver! })),
        ),
      )
      .catch(() => setApprovalLine([]));
  }

  function closeApplyModal() {
    setShowApplyModal(false);
    setStartDate("");
    setEndDate("");
    setDays("");
    setReason("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/leave/requests", {
        startDate,
        endDate,
        days: days ? Number(days) : undefined,
        reason: reason || undefined,
      });
      closeApplyModal();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const currentBalance = balances.find((b) => b.year === currentYear);
  const totalDays = currentBalance ? currentBalance.grantedDays + currentBalance.carriedOverDays : 0;
  const usedDays = currentBalance ? currentBalance.usedDays : 0;
  const remainingDays = totalDays - usedDays;

  return (
    <section>
      <h2>
        연차 관리
        <span className="help-icon">
          ?
          <span className="help-icon-tooltip">
            본인의 연차 현황과 신청 내역만 조회할 수 있습니다. 신청한 연차는 승인 대기 상태로
            등록되며, 관리자 승인 후 반영됩니다.
          </span>
        </span>
      </h2>

      <div className="toolbar">
        <button type="button" className="toolbar-end" onClick={openApplyModal}>
          연차 신청
        </button>
        <button type="button" onClick={() => setShowBasisModal(true)}>
          연차산출근거
        </button>
      </div>

      <div className="card">
        <h3>{currentYear}년 연차 현황</h3>
        <table>
          <thead>
            <tr>
              <th>발생</th>
              <th>사용</th>
              <th>잔여</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{totalDays}</td>
              <td>{usedDays}</td>
              <td>{remainingDays}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>신청 내역</h3>
        {requests.length === 0 && <p className="hint">신청 내역이 없습니다.</p>}
        {requests.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>기간</th>
                <th>일수</th>
                <th>사유</th>
                <th>상태</th>
                <th>신청일</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.startDate} ~ {r.endDate}
                  </td>
                  <td>{r.days}</td>
                  <td>{r.reason ?? "-"}</td>
                  <td>{STATUS_LABEL[r.status]}</td>
                  <td>{r.requestedAt}</td>
                  <td>
                    {r.documentId != null && (
                      <button type="button" onClick={() => setSelectedDocumentId(r.documentId)}>
                        상세
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showApplyModal && (
        <Modal onClose={closeApplyModal} wide>
          <div className="card">
            <h3>연차 신청</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24 }}>
              <form onSubmit={handleSubmit} className="stacked-form" style={{ maxWidth: "none" }}>
                <label>
                  시작일
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    required
                  />
                </label>
                <label>
                  종료일
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    required
                  />
                </label>
                <label>
                  일수 (자동 계산, 필요 시 수정 가능)
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    required
                  />
                </label>
                <label>
                  사유 (선택)
                  <input value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                {error && <p className="error">{error}</p>}
                <div className="form-actions">
                  <button type="submit" disabled={loading}>
                    신청
                  </button>
                  <button type="button" onClick={closeApplyModal}>
                    취소
                  </button>
                </div>
              </form>
              <div>
                <h4 style={{ marginBottom: 8 }}>결재선 미리보기</h4>
                <ApprovalLinePicker items={approvalLine} onChange={() => {}} readOnly />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {selectedDocumentId != null && (
        <ApprovalDocumentDetailModal
          documentId={selectedDocumentId}
          onClose={() => setSelectedDocumentId(null)}
          onChanged={load}
        />
      )}

      {showBasisModal && (
        <Modal onClose={() => setShowBasisModal(false)}>
          <div className="card">
            <h3>연차산출근거</h3>
            <p className="hint">근로기준법 제60조를 기준으로 자동 계산됩니다.</p>

            <h4>입사 1년 미만</h4>
            <p>매월 만근 시 1일씩 발생(최대 11일) — 제60조 제2항</p>

            <h4>입사 1년 이상 (회계연도 기준)</h4>
            <p>
              매년 1월 1일에 15일 부여, 3년차부터 근속 2년마다 1일씩 가산(최대 25일) — 제60조
              제1항·제4항
            </p>
            <p>입사 후 첫 회계연도는 재직일수에 비례해 계산: 15일 × 재직일수 / 365일</p>

            <p className="hint">
              현재는 실제 출근 기록이 없어 재직 중이면 만근으로 간주합니다. 근태관리(출근/퇴근)
              기능이 추가되면 실제 출근율 기준으로 대체될 예정입니다.
            </p>

            {currentUser && (
              <p>
                <b>내 입사일</b> {currentUser.hireDate}
              </p>
            )}

            <div className="form-actions">
              <button type="button" onClick={() => setShowBasisModal(false)}>
                닫기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
