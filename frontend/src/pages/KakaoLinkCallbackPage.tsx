import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function KakaoLinkCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const code = searchParams.get("code");
    if (!code) {
      setError("카카오 인증이 취소되었거나 실패했습니다.");
      return;
    }

    const redirectUri = `${window.location.origin}/kakao/link-callback`;
    api
      .post("/auth/kakao/link", { code, redirectUri })
      .then(async () => {
        await refresh();
        navigate("/", { replace: true });
      })
      .catch((err) => setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-shell">
      <div className="stacked-form card">
        <h2>카카오 계정 연동</h2>
        {error ? (
          <>
            <p className="error">{error}</p>
            <button type="button" onClick={() => navigate("/link-kakao", { replace: true })}>
              다시 시도
            </button>
          </>
        ) : (
          <p className="hint">연동 처리 중입니다...</p>
        )}
      </div>
    </div>
  );
}
