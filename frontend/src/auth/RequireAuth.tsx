import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

// 환경별로 카카오 연동 강제 여부를 끌 수 있다 (예: 테스트 서버는 KAKAO_REST_API_KEY 미등록/
// 테스트 계정 다수라 강제할 필요가 없을 때 frontend/.env.test에 "false"로 지정).
// 값이 없으면(운영 등) 기본값은 강제.
const REQUIRE_KAKAO_LINK = import.meta.env.VITE_REQUIRE_KAKAO_LINK !== "false";

export function RequireAuth() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="hint">불러오는 중...</p>;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location }} />;
  if (currentUser.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  // 비밀번호를 잊었을 때 관리자 승인 없이 본인이 직접 재설정할 수 있으려면 카카오 계정
  // 연동이 필수라, 아직 연동 안 한 계정은 로그인 직후 다른 화면으로 못 넘어가게 막는다.
  if (
    REQUIRE_KAKAO_LINK &&
    !currentUser.kakaoUserId &&
    location.pathname !== "/link-kakao" &&
    location.pathname !== "/kakao/link-callback"
  ) {
    return <Navigate to="/link-kakao" replace />;
  }
  return <Outlet />;
}
