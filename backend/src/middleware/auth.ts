import { getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { sessions, employees } from "../db/schema";
import type { AppEnv } from "../types";

export const SESSION_COOKIE = "sid";
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30분 미사용 시 자동 로그아웃

// "로그인 상태 유지" 여부에 따른 세션 절대 길이(초). sessions.expiresAt 계산과
// 로그인 쿠키의 maxAge가 이 두 값을 공통으로 사용해서 서로 어긋나지 않게 한다.
export const REMEMBER_ME_SESSION_SECONDS = 7 * 24 * 60 * 60; // 7일
export const DEFAULT_SESSION_SECONDS = 9 * 60 * 60; // 9시간

/**
 * 로그인 필요 라우트 앞단에 붙인다.
 * 세션이 유효하면 last_activity_at을 지금 시각으로 갱신하고,
 * IDLE_TIMEOUT_MS 동안 갱신이 없었던 세션은 만료 처리한다(자동 로그아웃).
 */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) return c.json({ error: "로그인이 필요합니다." }, 401);

  const db = getDb(c.env.DB);
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sid) });
  if (!session || session.revokedAt) {
    return c.json({ error: "로그인이 필요합니다." }, 401);
  }

  // 절대 만료(로그인 상태 유지 여부에 따른 7일/9시간). 이 컬럼 추가 이전에 발급된
  // 세션은 expiresAt이 NULL이므로 이 체크를 건너뛰고 idle timeout만 적용한다.
  if (session.expiresAt && Date.now() > new Date(session.expiresAt).getTime()) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(sessions.id, sid));
    return c.json({ error: "세션이 만료되었습니다. 다시 로그인해주세요." }, 401);
  }

  const lastActivityMs = new Date(session.lastActivityAt).getTime();
  if (Date.now() - lastActivityMs > IDLE_TIMEOUT_MS) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(sessions.id, sid));
    return c.json({ error: "일정 시간 사용이 없어 자동 로그아웃되었습니다. 다시 로그인해주세요." }, 401);
  }

  const employee = await db.query.employees.findFirst({
    where: eq(employees.employeeId, session.employeeId),
  });
  if (!employee || employee.employmentStatus === "RESIGNED") {
    return c.json({ error: "로그인이 필요합니다." }, 401);
  }

  await db
    .update(sessions)
    .set({ lastActivityAt: new Date().toISOString() })
    .where(eq(sessions.id, sid));

  c.set("currentUserId", employee.employeeId);
  await next();
}
