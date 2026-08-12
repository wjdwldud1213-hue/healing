import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="hint">불러오는 중...</p>;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location }} />;
  if (currentUser.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}
