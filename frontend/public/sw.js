// PWA 설치 요건(활성 서비스 워커) 충족용 최소 구성. 출퇴근/연차 데이터가 오래된 캐시로
// 보이면 안 되므로 아무것도 캐싱하지 않고 그대로 네트워크로 흘려보낸다. 오프라인 지원이
// 필요해지면 이 파일에 캐시 전략을 추가하면 된다.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
