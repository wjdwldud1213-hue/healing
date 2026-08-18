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

  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);

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

  async function handleSetPin(e: FormEvent) {
    e.preventDefault();
    setPinError(null);
    setPinMessage(null);
    if (pin !== pinConfirm) {
      setPinError("조회용 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setPinSubmitting(true);
    try {
      await api.post(`/employees/${currentUser!.employeeId}/set-view-pin`, { pin });
      setPin("");
      setPinConfirm("");
      setPinMessage("조회용 비밀번호가 설정되었습니다.");
    } catch (err) {
      setPinError((err as Error).message);
    } finally {
      setPinSubmitting(false);
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
      <div className="card">
        <h3>카카오 계정 연동</h3>
        <p className="hint">
          비밀번호를 잊었을 때 관리자 승인 없이 본인이 직접 재설정하는 데 사용됩니다.
        </p>
        <p>{currentUser.kakaoUserId ? "연동됨" : "연동 안 됨"}</p>
      </div>
      <div className="card">
        <h3>조회용 비밀번호(PIN)</h3>
        <p className="hint">
          이름/부서/직급/직군/내선번호를 제외한 내 개인정보는 다른 조회자에게 기본적으로
          가려집니다. 여기서 설정한 비밀번호를 입력해야만 그 조회자가 확인할 수 있습니다.
        </p>
        <form onSubmit={handleSetPin} className="stacked-form">
          <label>
            새 조회용 비밀번호 (숫자 4자리 이상)
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              minLength={4}
              required
            />
          </label>
          <label>
            새 조회용 비밀번호 확인
            <input
              type="password"
              inputMode="numeric"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value)}
              required
            />
          </label>
          {pinMessage && <p className="notice">{pinMessage}</p>}
          {pinError && <p className="error">{pinError}</p>}
          <button type="submit" disabled={pinSubmitting}>
            {pinSubmitting ? "설정 중..." : "설정"}
          </button>
        </form>
      </div>
    </section>
  );
}
