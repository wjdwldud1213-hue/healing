import { useState } from "react";
import { startKakaoAuth } from "../lib/kakaoAuth";

export function KakaoLinkPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      await startKakaoAuth("/kakao/link-callback");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="stacked-form card">
        <h2>카카오 계정 연동이 필요합니다</h2>
        <p className="hint">
          비밀번호를 잊었을 때 관리자 승인 없이 본인이 직접 재설정할 수 있도록, 카카오 계정을
          연동해야 계속 이용할 수 있습니다. 한 번만 연동하면 됩니다.
        </p>
        {error && <p className="error">{error}</p>}
        <button type="button" onClick={handleClick} disabled={loading}>
          {loading ? "이동 중..." : "카카오 계정으로 연동하기"}
        </button>
      </div>
    </div>
  );
}
