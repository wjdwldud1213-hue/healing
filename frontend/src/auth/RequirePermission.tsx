import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * 메뉴/화면 단위 권한 체크. 실제 접근 차단은 항상 백엔드 API가 최종적으로
 * 담당하고, 이건 "권한 없는 사용자에게 메뉴/화면을 보여주지 않는" 용도다.
 */
export function RequirePermission({ anyOf }: { anyOf: string[] }) {
  const { currentUser } = useAuth();
  const perms = currentUser?.permissions ?? [];
  const allowed = anyOf.some((p) => perms.includes(p));
  if (!allowed) return <Navigate to="/" replace />;
  return <Outlet />;
}
