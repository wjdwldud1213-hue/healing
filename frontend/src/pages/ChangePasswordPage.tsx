import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function ChangePasswordPage() {
  const { currentUser, refresh } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="auth-shell">
      <form onSubmit={handleSubmit} className="stacked-form card">
        <h2>비밀번호 변경</h2>
        {currentUser?.mustChangePassword && (
          <p className="hint">최초 로그인이라 비밀번호를 새로 설정해야 다음 화면으로 넘어갑니다.</p>
        )}
        <label>
          현재 비밀번호 (임시 비밀번호)
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
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
        {error && <p className="error">{error}</p>}
        <button type="submit">변경</button>
      </form>
    </div>
  );
}
