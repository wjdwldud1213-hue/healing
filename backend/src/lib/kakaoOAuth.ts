// 카카오 로그인(OAuth 2.0)으로 "이 사람이 특정 카카오 계정을 실제로 소유하고 있다"는 것만
// 확인한다. 전화번호/이메일 같은 민감 동의항목은 요청하지 않으므로 카카오 측 별도 비즈니스
// 심사가 필요 없다 — 지오코딩과 같은 카카오 앱을 그대로 재사용(Client ID = KAKAO_REST_API_KEY).
export function buildKakaoAuthorizeUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

// 인가 코드를 액세스 토큰으로 교환한 뒤, 그 토큰으로 카카오 고유 사용자 ID만 조회한다.
export async function exchangeKakaoCodeForUserId(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<string> {
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`카카오 토큰 발급에 실패했습니다 (${tokenRes.status}).`);
  }
  const tokenData = await tokenRes.json<{ access_token: string }>();

  const userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) {
    throw new Error(`카카오 사용자 정보 조회에 실패했습니다 (${userRes.status}).`);
  }
  const userData = await userRes.json<{ id: number }>();
  return String(userData.id);
}
