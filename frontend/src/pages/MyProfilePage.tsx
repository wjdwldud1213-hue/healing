import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatPhoneNumber } from "../lib/phone";

type CompensationLeaveSummary = { currentSalary: number | null; currentYearGrantedDays: number };

// 사번/이름/부서/직급/내선번호/주소는 PIN 없이 항상 보이고, 입사일/급여/연차일수/휴대폰번호는
// 본인이 설정한 조회용 비밀번호(PIN)를 입력해야 보인다(다른 사람이 아니라 본인이 스스로
// 잠금해제하는 자가조회 방식 — POST /employees/:id/unlock을 본인 사번으로 호출).
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

  const [unlocked, setUnlocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [summary, setSummary] = useState<CompensationLeaveSummary | null>(null);

  if (!currentUser) return null;

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setUnlockError(null);
    setUnlockLoading(true);
    try {
      await api.post(`/employees/${currentUser!.employeeId}/unlock`, { pin: unlockPin });
      const result = await api.get<CompensationLeaveSummary>(
        `/employees/${currentUser!.employeeId}/compensation-leave-summary`,
      );
      setSummary(result);
      setUnlocked(true);
      setMobilePhone(formatPhoneNumber(currentUser!.mobilePhone ?? ""));
    } catch (err) {
      setUnlockError((err as Error).message);
    } finally {
      setUnlockLoading(false);
    }
  }

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
          <b>입사일</b>{" "}
          {unlocked ? currentUser.hireDate : <span className="hint">🔒 PIN 입력 후 확인 가능</span>}
        </p>
        <p>
          <b>급여</b>{" "}
          {unlocked ? (
            summary?.currentSalary != null ? (
              `${summary.currentSalary.toLocaleString()}원`
            ) : (
              "이력 없음"
            )
          ) : (
            <span className="hint">🔒 PIN 입력 후 확인 가능</span>
          )}
        </p>
        <p>
          <b>연차일수</b>{" "}
          {unlocked ? `${summary?.currentYearGrantedDays ?? 0}일` : <span className="hint">🔒 PIN 입력 후 확인 가능</span>}
        </p>
        <p>
          <b>휴대폰번호</b>{" "}
          {unlocked ? currentUser.mobilePhone : <span className="hint">🔒 PIN 입력 후 확인 가능</span>}
        </p>
        <p>
          <b>내선번호</b> {currentUser.extensionNumber ?? "-"}
        </p>
        <p>
          <b>주소</b> {currentUser.address ?? "-"}
        </p>
        <p className="hint">
          이름/부서/직급 등은 관리자만 변경할 수 있습니다. 아래에서 연락처/주소만 직접 수정할 수
          있습니다.
        </p>

        {!unlocked && (
          <form onSubmit={handleUnlock} className="stacked-form">
            <label>
              조회용 비밀번호(PIN)
              <input
                type="password"
                inputMode="numeric"
                value={unlockPin}
                onChange={(e) => setUnlockPin(e.target.value)}
                required
              />
            </label>
            {unlockError && <p className="error">{unlockError}</p>}
            <button type="submit" disabled={unlockLoading}>
              {unlockLoading ? "확인 중..." : "잠금 해제"}
            </button>
          </form>
        )}

        <form onSubmit={handleSubmit} className="stacked-form">
          <label>
            휴대폰번호
            <input
              value={unlocked ? mobilePhone : ""}
              onChange={(e) => setMobilePhone(formatPhoneNumber(e.target.value))}
              placeholder={unlocked ? "" : "PIN 입력 후 수정 가능"}
              disabled={!unlocked}
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
          입사일/급여/연차일수/휴대폰번호처럼 개인정보에 해당하는 항목은 이 화면에서도 기본적으로
          가려집니다. 여기서 설정한 비밀번호를 입력해야 위에서 직접 확인할 수 있습니다.
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
