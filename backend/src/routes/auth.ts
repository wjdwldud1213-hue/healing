import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { getPermissionCodes } from "../lib/permissions";
import { buildKakaoAuthorizeUrl, exchangeKakaoCodeForUserId } from "../lib/kakaoOAuth";
import { employees, passwordResetTokens, sessions } from "../db/schema";
import {
  requireAuth,
  SESSION_COOKIE,
  REMEMBER_ME_SESSION_SECONDS,
  DEFAULT_SESSION_SECONDS,
} from "../middleware/auth";
import type { AppEnv } from "../types";

export const authRoute = new Hono<AppEnv>();

function publicEmployee(employee: typeof employees.$inferSelect) {
  const { passwordHash: _passwordHash, ...rest } = employee;
  return rest;
}

authRoute.post("/login", async (c) => {
  const body = await c.req
    .json<{ employeeId?: string; password?: string; rememberMe?: boolean }>()
    .catch(() => ({}) as { employeeId?: string; password?: string; rememberMe?: boolean });
  const employeeId = (body.employeeId ?? "").trim().toUpperCase();
  const password = body.password ?? "";
  const rememberMe = body.rememberMe === true;

  const invalid = () => c.json({ error: "사번 또는 비밀번호가 올바르지 않습니다." }, 401);
  if (!employeeId || !password) return invalid();

  const db = getDb(c.env.DB);
  const employee = await db.query.employees.findFirst({
    where: eq(employees.employeeId, employeeId),
    with: { department: true, jobGrade: true, jobTitle: true, role: true },
  });
  if (!employee || employee.employmentStatus === "RESIGNED") return invalid();

  const passwordOk = await bcrypt.compare(password, employee.passwordHash);
  if (!passwordOk) return invalid();

  // 로그인 상태 유지 체크 여부로 세션 절대 길이를 정하고, DB에 저장하는
  // expiresAt과 쿠키의 maxAge가 항상 같은 초 단위 값을 쓰도록 한 곳에서만 계산한다.
  const sessionSeconds = rememberMe ? REMEMBER_ME_SESSION_SECONDS : DEFAULT_SESSION_SECONDS;
  const sessionId = crypto.randomUUID();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + sessionSeconds * 1000).toISOString();

  await db.insert(sessions).values({
    id: sessionId,
    employeeId: employee.employeeId,
    createdAt: nowIso,
    lastActivityAt: nowIso,
    expiresAt,
    ipAddress: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: sessionSeconds, // sessions.expiresAt과 동일한 sessionSeconds 값을 그대로 사용
  });

  const codes = await getPermissionCodes(db, employee.roleId);
  return c.json({ employee: { ...publicEmployee(employee), permissions: Array.from(codes) } });
});

authRoute.post("/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) {
    const db = getDb(c.env.DB);
    await db.update(sessions).set({ revokedAt: new Date().toISOString() }).where(eq(sessions.id, sid));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoute.get("/me", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const employee = await db.query.employees.findFirst({
    where: eq(employees.employeeId, c.get("currentUserId")!),
    with: { department: true, jobGrade: true, jobTitle: true, role: true },
  });
  const codes = await getPermissionCodes(db, employee!.roleId);
  return c.json({ ...publicEmployee(employee!), permissions: Array.from(codes) });
});

authRoute.post("/change-password", requireAuth, async (c) => {
  const body = await c.req
    .json<{ currentPassword?: string; newPassword?: string }>()
    .catch(() => ({}) as { currentPassword?: string; newPassword?: string });
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (newPassword.length < 8) {
    return c.json({ error: "새 비밀번호는 8자 이상이어야 합니다." }, 400);
  }

  const db = getDb(c.env.DB);
  const employeeId = c.get("currentUserId")!;
  const employee = await db.query.employees.findFirst({ where: eq(employees.employeeId, employeeId) });
  if (!employee) return c.json({ error: "직원을 찾을 수 없습니다." }, 404);

  const currentOk = await bcrypt.compare(currentPassword, employee.passwordHash);
  if (!currentOk) return c.json({ error: "현재 비밀번호가 올바르지 않습니다." }, 400);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db
    .update(employees)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date().toISOString() })
    .where(eq(employees.employeeId, employeeId));

  return c.json({ ok: true });
});

// ── 카카오 계정 연동 기반 셀프 비밀번호 재설정 ──
// client_id(=KAKAO_REST_API_KEY)는 URL에 그대로 노출되는 값이라 인증 없이 내줘도 무방하다.
authRoute.get("/kakao/authorize-url", async (c) => {
  const redirectUri = c.req.query("redirectUri");
  if (!redirectUri) return c.json({ error: "redirectUri가 필요합니다." }, 400);
  return c.json({ url: buildKakaoAuthorizeUrl(c.env.KAKAO_REST_API_KEY, redirectUri) });
});

// 로그인한 본인 계정에 카카오 계정을 연동한다 (마이페이지/로그인 직후 강제 화면에서 호출).
authRoute.post("/kakao/link", requireAuth, async (c) => {
  const body = await c.req
    .json<{ code?: string; redirectUri?: string }>()
    .catch(() => ({}) as { code?: string; redirectUri?: string });
  const code = body.code ?? "";
  const redirectUri = body.redirectUri ?? "";
  if (!code || !redirectUri) return c.json({ error: "잘못된 요청입니다." }, 400);

  let kakaoUserId: string;
  try {
    kakaoUserId = await exchangeKakaoCodeForUserId(
      c.env.KAKAO_REST_API_KEY,
      c.env.KAKAO_LOGIN_CLIENT_SECRET,
      code,
      redirectUri,
    );
  } catch {
    return c.json({ error: "카카오 인증에 실패했습니다. 다시 시도해주세요." }, 400);
  }

  const db = getDb(c.env.DB);
  const employeeId = c.get("currentUserId")!;

  const existing = await db.query.employees.findFirst({
    where: eq(employees.kakaoUserId, kakaoUserId),
  });
  if (existing && existing.employeeId !== employeeId) {
    return c.json({ error: "이미 다른 계정에 연동된 카카오 계정입니다." }, 400);
  }

  await db
    .update(employees)
    .set({ kakaoUserId, updatedAt: new Date().toISOString() })
    .where(eq(employees.employeeId, employeeId));

  return c.json({ ok: true });
});

// 비로그인 상태 — 카카오 인증만으로 본인 확인 후 단기 재설정 토큰을 발급한다.
authRoute.post("/kakao/reset-verify", async (c) => {
  const body = await c.req
    .json<{ code?: string; redirectUri?: string }>()
    .catch(() => ({}) as { code?: string; redirectUri?: string });
  const code = body.code ?? "";
  const redirectUri = body.redirectUri ?? "";

  const invalid = () =>
    c.json({ error: "연동된 계정을 찾을 수 없습니다. 먼저 마이페이지에서 카카오 계정을 연동해주세요." }, 400);
  if (!code || !redirectUri) return invalid();

  let kakaoUserId: string;
  try {
    kakaoUserId = await exchangeKakaoCodeForUserId(
      c.env.KAKAO_REST_API_KEY,
      c.env.KAKAO_LOGIN_CLIENT_SECRET,
      code,
      redirectUri,
    );
  } catch {
    return c.json({ error: "카카오 인증에 실패했습니다. 다시 시도해주세요." }, 400);
  }

  const db = getDb(c.env.DB);
  const employee = await db.query.employees.findFirst({
    where: eq(employees.kakaoUserId, kakaoUserId),
  });
  if (!employee || employee.employmentStatus === "RESIGNED") return invalid();

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await db.insert(passwordResetTokens).values({ employeeId: employee.employeeId, token, expiresAt });

  return c.json({ resetToken: token, employeeId: employee.employeeId, name: employee.name });
});

// 재설정 토큰 + 새 비밀번호로 실제 비밀번호를 변경한다. 본인이 직접 정하는 것이므로
// (임시 비밀번호가 아니라) mustChangePassword를 강제하지 않는다.
authRoute.post("/kakao/reset-complete", async (c) => {
  const body = await c.req
    .json<{ resetToken?: string; newPassword?: string }>()
    .catch(() => ({}) as { resetToken?: string; newPassword?: string });
  const resetToken = body.resetToken ?? "";
  const newPassword = body.newPassword ?? "";

  const invalid = () => c.json({ error: "인증이 만료되었습니다. 처음부터 다시 시도해주세요." }, 400);
  if (!resetToken) return invalid();
  if (newPassword.length < 8) {
    return c.json({ error: "새 비밀번호는 8자 이상이어야 합니다." }, 400);
  }

  const db = getDb(c.env.DB);
  const row = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.token, resetToken),
  });
  if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) return invalid();

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const now = new Date().toISOString();
  await db.batch([
    db
      .update(employees)
      .set({ passwordHash, mustChangePassword: false, updatedAt: now })
      .where(eq(employees.employeeId, row.employeeId)),
    db.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, row.id)),
  ]);

  return c.json({ ok: true });
});
