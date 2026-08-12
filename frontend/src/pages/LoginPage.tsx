import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="auth-shell">
      <form onSubmit={handleSubmit} className="stacked-form card">
        <h2>로그인</h2>
        <label>
          사번
          <input
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
            placeholder="예: A0001"
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          로그인
        </button>
        <Link to="/forgot-password" className="hint">
          비밀번호를 잊으셨나요?
        </Link>
      </form>
    </div>
  );
}
