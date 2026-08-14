import { api } from "../api/client";

// 카카오 인증 화면으로 이동한다. callbackPath는 호출한 콜백 페이지 자신의 경로여야 한다 —
// 카카오는 인가 요청 때와 토큰 교환 때의 redirect_uri가 정확히 같아야 통과시킨다.
export async function startKakaoAuth(callbackPath: string): Promise<void> {
  const redirectUri = `${window.location.origin}${callbackPath}`;
  const { url } = await api.get<{ url: string }>(
    `/auth/kakao/authorize-url?redirectUri=${encodeURIComponent(redirectUri)}`,
  );
  window.location.href = url;
}
