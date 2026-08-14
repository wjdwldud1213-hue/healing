import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatPhoneNumber } from "../lib/phone";

const STATUS_LABEL: Record<string, string> = { ACTIVE: "재직", LEAVE: "휴직", RESIGNED: "퇴사" };

export function MyProfilePage() {
  const { currentUser, refresh } = useAuth();
  const [mobilePhone, setMobilePhone] = useState(formatPhoneNumber(currentUser?.mobilePhone ?? ""));
  const [extensionNumber, setExtensionNumber] = useState(
    formatPhoneNumber(currentUser?.extensionNumber ?? ""),
  );
  const [address, setAddress] = useState(currentUser?.address ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!currentUser) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.patch(`/employees/${currentUser!.employeeId}`, {
        mobilePhone,
        extensionNumber: extensionNumber || null,
        address: address || null,
      });
      await refresh();
      setMessage("저장되었습니다.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section>
      <h2>내 정보</h2>
      <div className="card">
        <p>
          <b>사번</b> {currentUser.employeeId}
        </p>
        <p>
          <b>이름</b> {currentUser.name}
        </p>
        <p>
          <b>부서</b> {currentUser.department.name}
        </p>
        <p>
          <b>직급</b> {currentUser.jobGrade.name}
        </p>
        <p>
          <b>재직상태</b> {STATUS_LABEL[currentUser.employmentStatus]}
        </p>
        <p>
          <b>역할</b> {currentUser.role.name}
        </p>
        <p className="hint">
          이름/부서/직급 등은 관리자만 변경할 수 있습니다. 아래 연락처/주소만 직접 수정할 수
          있습니다.
        </p>
        <form onSubmit={handleSubmit} className="stacked-form">
          <label>
            휴대폰번호
            <input
              value={mobilePhone}
              onChange={(e) => setMobilePhone(formatPhoneNumber(e.target.value))}
              required
            />
          </label>
          <label>
            내선번호 (선택)
            <input
              value={extensionNumber ?? ""}
              onChange={(e) => setExtensionNumber(formatPhoneNumber(e.target.value))}
            />
          </label>
          <label>
            주소
            <input value={address ?? ""} onChange={(e) => setAddress(e.target.value)} />
          </label>
          {message && <p className="notice">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit">저장</button>
        </form>
      </div>
    </section>
  );
}
