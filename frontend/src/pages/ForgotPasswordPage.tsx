import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { formatPhoneNumber } from "../lib/phone";

export function ForgotPasswordPage() {
  const [employeeId, setEmployeeId] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await api.post<{ message: string }>("/auth/password-reset-requests", {
        employeeId,
        mobilePhone,
      });
      setMessage(res.message);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="auth-shell">
      <form onSubmit={handleSubmit} className="stacked-form card">
        <h2>비밀번호 재설정 요청</h2>
        <p className="hint">
          이메일이 없는 사내 시스템이라, 사번과 등록된 휴대폰번호로 본인 확인 후 관리자가
          승인하면 임시 비밀번호가 발급됩니다.
        </p>
        <label>
          사번
          <input
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
            required
          />
        </label>
        <label>
          휴대폰번호
          <input
            value={mobilePhone}
            onChange={(e) => setMobilePhone(formatPhoneNumber(e.target.value))}
            required
          />
        </label>
        {message && <p className="notice">{message}</p>}
        {error && <p className="error">{error}</p>}
        <button type="submit">요청</button>
        <Link to="/login" className="hint">
          로그인으로 돌아가기
        </Link>
      </form>
    </div>
  );
}
