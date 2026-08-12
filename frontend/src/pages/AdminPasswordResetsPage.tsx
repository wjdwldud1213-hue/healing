import { useEffect, useState } from "react";
import { api } from "../api/client";

type ResetRequest = {
  id: number;
  employeeId: string;
  requestedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

export function AdminPasswordResetsPage() {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [issued, setIssued] = useState<{ employeeId: string; tempPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<ResetRequest[]>("/auth/password-reset-requests")
      .then(setRequests)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  async function approve(id: number) {
    setError(null);
    try {
      const result = await api.post<{ employeeId: string; tempPassword: string }>(
        `/auth/password-reset-requests/${id}/approve`,
      );
      setIssued(result);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reject(id: number) {
    await api.post(`/auth/password-reset-requests/${id}/reject`);
    load();
  }

  return (
    <section>
      <h2>비밀번호 재설정 요청 관리</h2>
      {issued && (
        <p className="notice">
          {issued.employeeId} 님의 새 임시 비밀번호: <b>{issued.tempPassword}</b> — 본인에게 직접
          전달해 주세요.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>사번</th>
            <th>요청일시</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.employeeId}</td>
              <td>{r.requestedAt}</td>
              <td className="row-actions">
                <button type="button" onClick={() => approve(r.id)}>
                  승인
                </button>
                <button type="button" onClick={() => reject(r.id)}>
                  거절
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 && <p className="hint">대기 중인 요청이 없습니다.</p>}
    </section>
  );
}
