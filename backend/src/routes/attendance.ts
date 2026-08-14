import { Hono } from "hono";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../lib/db";
import { attendanceLogs, employees } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { getPermissionCodes } from "../lib/permissions";
import { AttendanceError, checkIn, checkOut } from "../lib/attendance";
import type { CheckPayload } from "../lib/attendance";
import type { AppEnv } from "../types";

export const attendanceRoute = new Hono<AppEnv>();
attendanceRoute.use("*", requireAuth);

// 로그인 사용자의 현재 WORKING 기록(없으면 null) — 프론트가 출근/퇴근 버튼 상태를 판단하는 데 쓴다.
attendanceRoute.get("/status", async (c) => {
  const employeeId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);
  const working = await db.query.attendanceLogs.findFirst({
    where: and(eq(attendanceLogs.employeeId, employeeId), eq(attendanceLogs.status, "WORKING")),
  });
  return c.json(working ?? null);
});

function parseCheckBody(body: unknown): CheckPayload | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const deviceType = b.deviceType;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (deviceType !== "WEB" && deviceType !== "IOS" && deviceType !== "ANDROID") return null;
  return {
    lat,
    lng,
    accuracy: typeof b.accuracy === "number" ? b.accuracy : null,
    deviceType,
    isMocked: typeof b.isMocked === "boolean" ? b.isMocked : null,
  };
}

attendanceRoute.post("/check-in", async (c) => {
  const employeeId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);
  const employee = await db.query.employees.findFirst({ where: eq(employees.employeeId, employeeId) });
  if (!employee) return c.json({ error: "로그인이 필요합니다." }, 401);

  const payload = parseCheckBody(await c.req.json().catch(() => ({})));
  if (!payload) return c.json({ error: "위치 정보(lat/lng)와 deviceType을 확인하세요." }, 400);

  try {
    // 멱등 처리 대상이라 이미 존재하는 기록을 반환할 수도 있으므로 201(Created) 대신 200을 쓴다.
    const result = await checkIn(db, employeeId, employee.jobType, payload);
    return c.json(result, 200);
  } catch (e) {
    if (e instanceof AttendanceError) return c.json({ error: e.message }, e.statusCode);
    throw e;
  }
});

attendanceRoute.post("/check-out", async (c) => {
  const employeeId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);
  const employee = await db.query.employees.findFirst({ where: eq(employees.employeeId, employeeId) });
  if (!employee) return c.json({ error: "로그인이 필요합니다." }, 401);

  const payload = parseCheckBody(await c.req.json().catch(() => ({})));
  if (!payload) return c.json({ error: "위치 정보(lat/lng)와 deviceType을 확인하세요." }, 400);

  try {
    const updated = await checkOut(db, employeeId, employee.jobType, payload);
    return c.json(updated);
  } catch (e) {
    if (e instanceof AttendanceError) return c.json({ error: e.message }, e.statusCode);
    throw e;
  }
});

// 기본은 본인 기록만; employeeId 파라미터는 ATTENDANCE_MANAGE 권한이 있을 때만 반영한다.
attendanceRoute.get("/logs", async (c) => {
  const employeeId = c.get("currentUserId")!;
  const db = getDb(c.env.DB);
  const from = c.req.query("from");
  const to = c.req.query("to");
  const requestedEmployeeId = c.req.query("employeeId");

  let targetEmployeeId = employeeId;
  if (requestedEmployeeId && requestedEmployeeId !== employeeId) {
    const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, employeeId) });
    const codes = await getPermissionCodes(db, actor!.roleId);
    if (codes.has("ATTENDANCE_MANAGE")) targetEmployeeId = requestedEmployeeId;
  }

  const conditions = [eq(attendanceLogs.employeeId, targetEmployeeId)];
  if (from) conditions.push(gte(attendanceLogs.checkInAt, from));
  if (to) conditions.push(lte(attendanceLogs.checkInAt, `${to}T23:59:59`));

  const rows = await db
    .select()
    .from(attendanceLogs)
    .where(and(...conditions))
    .orderBy(desc(attendanceLogs.checkInAt));
  return c.json(rows);
});
