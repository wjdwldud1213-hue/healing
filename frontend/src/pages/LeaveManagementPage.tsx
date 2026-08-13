import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { LeaveBalance, LeaveRequest } from "../types";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "신청중",
  APPROVED: "승인",
  REJECTED: "반려",
};

export function LeaveManagementPage() {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    api.get<LeaveBalance[]>("/leave/balance").then(setBalances).catch((e) => setError(e.message));
    api.get<LeaveRequest[]>("/leave/requests").then(setRequests).catch((e) => setError(e.message));
  }

  useEffect(load, []);

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
      setStartDate("");
      setEndDate("");
      setDays("");
      setReason("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>연차 관리</h2>
      <p className="hint">
        본인의 연차 현황과 신청 내역만 조회할 수 있습니다. 신청한 연차는 승인 대기 상태로
        등록되며, 승인/반려 기능은 추후 제공됩니다.
      </p>

      <div className="card">
        <h3>연차 현황</h3>
        {balances.length === 0 && <p className="hint">등록된 연차 발생 내역이 없습니다.</p>}
        {balances.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>연도</th>
                <th>발생</th>
                <th>이월</th>
                <th>사용</th>
                <th>잔여</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.id}>
                  <td>{b.year}</td>
                  <td>{b.grantedDays}</td>
                  <td>{b.carriedOverDays}</td>
                  <td>{b.usedDays}</td>
                  <td>{b.grantedDays + b.carriedOverDays - b.usedDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>연차 신청</h3>
        <form onSubmit={handleSubmit} className="stacked-form">
          <label>
            시작일
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          <label>
            종료일
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </label>
          <label>
            일수
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
          </div>
        </form>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
