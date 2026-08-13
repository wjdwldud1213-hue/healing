import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function EyeIcon({ off }: { off: boolean }) {
  if (off) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path
          d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.24A9.7 9.7 0 0 1 12 4c5 0 9 4 10 8-.4 1.5-1.2 2.9-2.3 4.1M6.1 6.1C3.9 7.5 2.3 9.6 2 12c.6 2.2 2 4.1 3.9 5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function BrandPath() {
  return (
    <svg className="brand-path" viewBox="0 0 340 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15 65 Q 90 15, 165 48 T 325 25"
        stroke="#4b6b5c"
        strokeWidth="1.5"
        strokeDasharray="4 6"
      />
      <circle cx="15" cy="65" r="5" fill="#B65D34" />
      <circle cx="130" cy="35" r="4" fill="#7f9186" />
      <circle cx="240" cy="52" r="4" fill="#7f9186" />
      <circle cx="325" cy="25" r="5" fill="#B65D34" />
    </svg>
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
    <div className="login-split">
      <aside className="login-brand">
        <div className="login-brand-top">
          <div className="brand-logo-box">H</div>
          <div>
            <div className="brand-logo-text">Healing Food</div>
            <div className="brand-sub-text">최상의 제품을 정직하게 공급하는 기업 (주) 힐링푸드</div>
          </div>
        </div>

        <div className="login-brand-mid">
          <p className="brand-eyebrow">EMPLOYEE PORTAL</p>
          <h1 className="brand-headline">
            오늘도 신선하게,
            <br />
            힐링푸드의 하루가
            <br />
            시작됩니다.
          </h1>
          <p className="brand-desc">
            주문 접수부터 배송까지, 사내 업무를 하나의 시스템에서 확인하세요.
          </p>
          <BrandPath />
        </div>

        <p className="brand-footer">&copy; 2026 Healing Food Co., Ltd.</p>
      </aside>

      <section className="login-form-panel">
        <div className="login-form-inner">
          <h2 className="login-title">로그인</h2>
          <p className="login-subtitle">사내 계정으로 로그인해 주세요.</p>

          <form onSubmit={handleSubmit} className="login-form">
            <label className="login-field">
              <span>아이디(사번)</span>
              <input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                placeholder="사번 또는 아이디를 입력하세요"
                required
              />
            </label>

            <label className="login-field">
              <span>비밀번호</span>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </label>

            <div className="login-options-row">
              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                로그인 상태 유지
              </label>
              <Link to="/forgot-password" className="forgot-link">
                비밀번호를 잊으셨나요?
              </Link>
            </div>

            {error && <p className="error">{error}</p>}

            <button type="submit" className="login-submit" disabled={loading}>
              로그인
            </button>
          </form>

          <div className="login-divider">
            <span>사내 공지</span>
          </div>

          <div className="login-notice">
            <p>
              오늘 15시 이후 접수 건은 <b>익일 새벽 출고</b>로 자동 전환됩니다. 담당 부서는
              참고해 주세요.
            </p>
          </div>

          <Link to="/forgot-password" className="login-reset-link">
            비밀번호 재설정
          </Link>
          <p className="login-footnote">힐링푸드 직원 전용 시스템입니다.</p>
        </div>
      </section>
    </div>
  );
}
