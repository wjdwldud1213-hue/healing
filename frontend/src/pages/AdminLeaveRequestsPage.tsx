import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LeaveRequest } from "../types";

export function AdminLeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<LeaveRequest[]>("/leave/admin/requests")
      .then(setRequests)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  async function approve(id: number) {
    setError(null);
    try {
      await api.post(`/leave/admin/requests/${id}/approve`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reject(id: number) {
    setError(null);
    try {
      await api.post(`/leave/admin/requests/${id}/reject`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section>
      <h2>연차 승인</h2>
      <p className="hint">
        결재(기안) 기능이 도입되기 전까지는 관리자가 이 화면에서 직접 승인/반려합니다. 승인하면
        해당 연도 잔여 연차에서 즉시 차감됩니다.
      </p>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>사번</th>
            <th>기간</th>
            <th>일수</th>
            <th>사유</th>
            <th>신청일</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.employeeId}</td>
              <td>
                {r.startDate} ~ {r.endDate}
              </td>
              <td>{r.days}</td>
              <td>{r.reason ?? "-"}</td>
              <td>{r.requestedAt}</td>
              <td className="row-actions">
                <button type="button" onClick={() => approve(r.id)}>
                  승인
                </button>
                <button type="button" onClick={() => reject(r.id)}>
                  반려
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 && <p className="hint">대기 중인 신청이 없습니다.</p>}
    </section>
  );
}
