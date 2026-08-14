import { useState } from "react";
import { Link } from "react-router-dom";
import { startKakaoAuth } from "../lib/kakaoAuth";

export function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      await startKakaoAuth("/kakao/reset-callback");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="stacked-form card">
        <h2>비밀번호 재설정</h2>
        <p className="hint">
          이메일이 없는 사내 시스템이라, 미리 연동해둔 카카오 계정으로 본인 확인 후 직접 새
          비밀번호를 설정합니다. 관리자 승인은 필요 없습니다.
        </p>
        {error && <p className="error">{error}</p>}
        <button type="button" onClick={handleClick} disabled={loading}>
          {loading ? "이동 중..." : "카카오 계정으로 인증하기"}
        </button>
        <p className="hint">아직 카카오 계정을 연동하지 않았다면, 로그인 후 자동으로 안내됩니다.</p>
        <Link to="/login" className="hint">
          로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
