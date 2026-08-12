import { getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { sessions, employees } from "../db/schema";
import type { AppEnv } from "../types";

export const SESSION_COOKIE = "sid";
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30분 미사용 시 자동 로그아웃

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
