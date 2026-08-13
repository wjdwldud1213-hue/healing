import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function EyeIcon({ revealed }: { revealed: boolean }) {
  if (revealed) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RouteGraphic() {
  return (
    <div className="login-route-graphic" aria-hidden="true">
      <svg viewBox="0 0 300 90" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M10 70 C 70 70, 70 20, 130 20 S 190 70, 250 70 S 280 40, 292 40"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.5"
          strokeDasharray="3 6"
          fill="none"
        />
        <circle cx="10" cy="70" r="4" fill="#E7A33D" />
        <circle cx="130" cy="20" r="3.5" fill="rgba(255,255,255,0.55)" />
        <circle cx="250" cy="70" r="3.5" fill="rgba(255,255,255,0.55)" />
        <circle cx="292" cy="40" r="4" fill="#B65D34" />
      </svg>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(employeeId, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        {/* LEFT: BRAND PANEL */}
        <div className="login-brand">
          <div className="login-brand-top">
            <div className="login-logo-row">
              <div className="login-logo-mark">H</div>
              <div className="login-logo-text">Healing Food</div>
            </div>
            <p className="login-company-kr">최상의 제품을 정직하게 공급하는 기업 (주) 힐링푸드</p>

            <RouteGraphic />
          </div>

          <div className="login-brand-bottom">
            <p>&copy; 2026 Healing Food Co., Ltd.</p>
          </div>
        </div>

        {/* RIGHT: FORM PANEL */}
        <div className="login-form-panel">
          <div className="login-form-header">
            <h1>로그인</h1>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="employeeId">아이디</label>
              <div className="login-input-wrap">
                <input
                  type="text"
                  id="employeeId"
                  name="employeeId"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                  placeholder="사번을 입력하세요"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password">비밀번호</label>
              <div className="login-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-toggle-visibility"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                >
                  <EyeIcon revealed={showPassword} />
                </button>
              </div>
            </div>

            <div className="login-row-between">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                로그인 상태 유지
              </label>
              <Link to="/forgot-password" className="login-link-muted">
                비밀번호를 잊으셨나요?
              </Link>
            </div>

            {error && <p className="error">{error}</p>}

            <button type="submit" className="login-btn" disabled={loading}>
              로그인
            </button>
          </form>

          <div className="login-divider">
            <span>사내 공지</span>
          </div>

          <div className="login-notice">
            <span className="login-notice-dot" />
            <p>
              오늘 <strong>15시</strong> 이후 접수 건은 <strong>익일 새벽 출고</strong>로 자동
              전환됩니다. 담당 부서는 참고해 주세요.
            </p>
          </div>

          <div className="login-reset-row">
            <Link to="/forgot-password">비밀번호 재설정</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
