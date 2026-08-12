import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { generateTempPassword } from "../lib/employeeId";
import { getPermissionCodes } from "../lib/permissions";
import { employees, passwordResetRequests, sessions } from "../db/schema";
import { requireAuth, SESSION_COOKIE } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import type { AppEnv } from "../types";

export const authRoute = new Hono<AppEnv>();

function publicEmployee(employee: typeof employees.$inferSelect) {
  const { passwordHash: _passwordHash, ...rest } = employee;
  return rest;
}

authRoute.post("/login", async (c) => {
  const body = await c.req
    .json<{ employeeId?: string; password?: string }>()
    .catch(() => ({}) as { employeeId?: string; password?: string });
  const employeeId = (body.employeeId ?? "").trim().toUpperCase();
  const password = body.password ?? "";

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

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(sessions).values({
    id: sessionId,
    employeeId: employee.employeeId,
    createdAt: now,
    lastActivityAt: now,
    ipAddress: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 12, // 12시간. 그 안에서도 30분 미사용이면 idle timeout으로 먼저 만료됨
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

// ── 비밀번호 재설정 (이메일이 없으므로 관리자 승인 방식의 기초 버전) ──
authRoute.post("/password-reset-requests", async (c) => {
  const body = await c.req
    .json<{ employeeId?: string; mobilePhone?: string }>()
    .catch(() => ({}) as { employeeId?: string; mobilePhone?: string });
  const employeeId = (body.employeeId ?? "").trim().toUpperCase();
  const mobilePhone = (body.mobilePhone ?? "").trim();

  const invalid = () => c.json({ error: "사번 또는 휴대폰번호가 일치하지 않습니다." }, 400);
  if (!employeeId || !mobilePhone) return invalid();

  const db = getDb(c.env.DB);
  const employee = await db.query.employees.findFirst({ where: eq(employees.employeeId, employeeId) });
  if (!employee || employee.employmentStatus === "RESIGNED" || employee.mobilePhone !== mobilePhone) {
    return invalid();
  }

  await db.insert(passwordResetRequests).values({ employeeId });
  return c.json({ message: "요청이 접수되었습니다. 관리자 승인 후 임시 비밀번호가 발급됩니다." }, 201);
});

authRoute.get("/password-reset-requests", requireAuth, requirePermission("EMPLOYEE_APPROVE"), async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.query.passwordResetRequests.findMany({
    where: eq(passwordResetRequests.status, "PENDING"),
    orderBy: (r, { asc }) => [asc(r.requestedAt)],
  });
  return c.json(rows);
});

authRoute.post("/password-reset-requests/:id/approve", requireAuth, requirePermission("EMPLOYEE_APPROVE"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const request = await db.query.passwordResetRequests.findFirst({
    where: eq(passwordResetRequests.id, id),
  });
  if (!request || request.status !== "PENDING") {
    return c.json({ error: "처리할 수 없는 요청입니다." }, 400);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const actorId = c.get("currentUserId");
  const now = new Date().toISOString();

  await db.batch([
    db
      .update(employees)
      .set({ passwordHash, mustChangePassword: true, updatedAt: now, updatedBy: actorId })
      .where(eq(employees.employeeId, request.employeeId)),
    db
      .update(passwordResetRequests)
      .set({ status: "APPROVED", approvedBy: actorId, approvedAt: now })
      .where(eq(passwordResetRequests.id, id)),
  ]);

  return c.json({ employeeId: request.employeeId, tempPassword });
});

authRoute.post("/password-reset-requests/:id/reject", requireAuth, requirePermission("EMPLOYEE_APPROVE"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId");
  await db
    .update(passwordResetRequests)
    .set({ status: "REJECTED", approvedBy: actorId, approvedAt: new Date().toISOString() })
    .where(eq(passwordResetRequests.id, id));
  return c.json({ ok: true });
});
