export type Bindings = {
  DB: D1Database;
  KAKAO_REST_API_KEY: string;
  // 카카오 로그인(비밀번호 재설정용 계정 연동)은 지오코딩과 같은 카카오 앱을 쓰므로
  // Client ID는 KAKAO_REST_API_KEY를 그대로 재사용하고, Client Secret만 별도로 둔다.
  KAKAO_LOGIN_CLIENT_SECRET: string;
};

// currentUserId는 4단계(로그인) 미들웨어가 실제 로그인 세션에서 채워 넣는다.
// 그 전까지는 항상 null이며, 등록/수정 이력의 담당자 칸도 null로 남는다.
export type Variables = {
  currentUserId: string | null;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
