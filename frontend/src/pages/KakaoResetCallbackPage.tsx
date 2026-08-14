import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

type VerifyResult = { resetToken: string; employeeId: string; name: string };

export function KakaoResetCallbackPage() {
  const [searchParams] = useSearchParams();
  const ranOnce = useRef(false);

  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const code = searchParams.get("code");
    if (!code) {
      setVerifyError("카카오 인증이 취소되었거나 실패했습니다.");
      setVerifying(false);
      return;
    }

    const redirectUri = `${window.location.origin}/kakao/reset-callback`;
    api
      .post<VerifyResult>("/auth/kakao/reset-verify", { code, redirectUri })
      .then((result) => setVerified(result))
      .catch((err) => setVerifyError((err as Error).message))
      .finally(() => setVerifying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!verified) return;
    if (newPassword !== confirmPassword) {
      setSubmitError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/kakao/reset-complete", { resetToken: verified.resetToken, newPassword });
      setDone(true);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="auth-shell">
        <div className="stacked-form card">
          <h2>비밀번호가 변경되었습니다</h2>
          <p className="notice">새 비밀번호로 다시 로그인해주세요.</p>
          <Link to="/login" className="hint">
            로그인으로 이동
          </Link>
        </div>
      </div>
    );
  }

  if (verifying) {
    return (
      <div className="auth-shell">
        <div className="stacked-form card">
          <h2>본인 확인 중</h2>
          <p className="hint">카카오 인증을 확인하고 있습니다...</p>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="auth-shell">
        <div className="stacked-form card">
          <h2>본인 확인 실패</h2>
          <p className="error">{verifyError}</p>
          <Link to="/forgot-password" className="hint">
            다시 시도
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <form onSubmit={handleSubmit} className="stacked-form card">
        <h2>새 비밀번호 설정</h2>
        <p className="hint">
          {verified.name}({verified.employeeId}) 님 확인되었습니다. 새 비밀번호를 설정해주세요.
        </p>
        <label>
          새 비밀번호 (8자 이상)
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label>
          새 비밀번호 확인
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>
        {submitError && <p className="error">{submitError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
