// 카카오 로컬 API(주소 검색)로 주소 문자열을 좌표로 변환한다. 프론트는 API 키를 알 필요가 없도록
// 이 호출은 항상 백엔드에서만 한다(work_places 등록/수정 시 서버가 대행).
export type GeocodeResult = { lat: number; lng: number };

export async function geocodeAddress(apiKey: string, address: string): Promise<GeocodeResult | null> {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`카카오 주소 검색 API 호출에 실패했습니다 (${res.status}).`);
  }

  const data = await res.json<{ documents: { x: string; y: string }[] }>();
  const first = data.documents?.[0];
  if (!first) return null;

  return { lat: Number(first.y), lng: Number(first.x) };
}
