export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

// 세션이 만료(자동 로그아웃 포함)되면 서버가 401을 반환한다.
// AuthContext가 이 콜백을 등록해서, 그 순간 바로 로그인 화면으로 돌려보낸다.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // FormData(파일 업로드)는 브라우저가 알아서 boundary 포함 Content-Type을 붙여야 하므로
  // 여기서 application/json을 강제하면 안 된다.
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: isFormData
      ? { ...(options?.headers ?? {}) }
      : { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (res.status === 401) {
    onUnauthorized?.();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `요청이 실패했습니다 (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// 부서/직급/역할처럼 여러 화면이 그대로 재사용하고 자주 안 바뀌는 참조데이터용 캐시.
// 화면을 옮겨다니거나 모달을 반복해서 열 때마다 같은 목록을 매번 재요청하지 않도록,
// 진행 중인(또는 완료된) 요청의 Promise를 경로별로 재사용한다. 실패한 요청은 캐시에
// 남기지 않아 다음 호출에서 재시도된다. 데이터를 바꾸는 화면은 invalidate로 갱신한다.
const referenceCache = new Map<string, Promise<unknown>>();

function getCached<T>(path: string): Promise<T> {
  const cached = referenceCache.get(path) as Promise<T> | undefined;
  if (cached) return cached;
  const fresh = request<T>(path).catch((err) => {
    referenceCache.delete(path);
    throw err;
  });
  referenceCache.set(path, fresh);
  return fresh;
}

function invalidateCache(path: string) {
  referenceCache.delete(path);
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  getCached,
  invalidateCache,
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T,>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
};
