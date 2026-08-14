import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import { attendanceLogs, workPlaces } from "../db/schema";

// 라우트 핸들러에서 로직을 분리해 둔다 — leaveApproval.ts와 동일한 패턴.
export class AttendanceError extends Error {
  statusCode: 400 | 403;
  constructor(message: string, statusCode: 400 | 403 = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export type JobType = "OFFICE" | "DELIVERY" | "SALES";
export type DeviceType = "WEB" | "IOS" | "ANDROID";
export type CheckAction = "checkIn" | "checkOut";

// 사무직: 출근/퇴근 모두 근무지 반경 이내가 아니면 막는다(필수). 배송직: 출근만 필수(퇴근은 막지 않음).
// 영업직: 출퇴근 모두 막지 않음. 다만 "막지 않음"인 경우에도 근무지 반경 안에 있으면 일반 출근/퇴근(NORMAL)으로,
// 밖이면 현장출근/현장퇴근(FIELD)으로 자동 분류한다 — checkIn/checkOut의 findNearestActiveWorkPlace 결과로 판단.
export function requiresRadiusCheck(jobType: JobType, action: CheckAction): boolean {
  if (jobType === "OFFICE") return true;
  if (jobType === "DELIVERY") return action === "checkIn";
  return false;
}

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 지구 반지름(m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearestActiveWorkPlace(db: Db, lat: number, lng: number) {
  const places = await db.query.workPlaces.findMany({ where: eq(workPlaces.isActive, true) });
  let nearest: { id: number; distance: number } | null = null;
  for (const place of places) {
    const distance = haversineDistanceMeters(lat, lng, place.latitude, place.longitude);
    if (distance <= place.radiusM && (!nearest || distance < nearest.distance)) {
      nearest = { id: place.id, distance };
    }
  }
  return nearest;
}

export type CheckPayload = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  deviceType: DeviceType;
  isMocked?: boolean | null;
};

export async function checkIn(db: Db, employeeId: string, jobType: JobType, body: CheckPayload) {
  const existing = await db.query.attendanceLogs.findFirst({
    where: and(eq(attendanceLogs.employeeId, employeeId), eq(attendanceLogs.status, "WORKING")),
  });
  // 네트워크 재시도 등으로 같은 출근 요청이 중복 도착해도 에러 대신 기존 기록을 그대로 반환한다(멱등 처리).
  if (existing) return existing;

  const nearest = await findNearestActiveWorkPlace(db, body.lat, body.lng);
  if (!nearest && requiresRadiusCheck(jobType, "checkIn")) {
    throw new AttendanceError("지정된 근무지 100m 이내에서만 출근할 수 있습니다.", 403);
  }
  const workPlaceId = nearest?.id ?? null;
  const checkInType: "NORMAL" | "FIELD" = nearest ? "NORMAL" : "FIELD";

  const now = new Date().toISOString();
  try {
    const [created] = await db
      .insert(attendanceLogs)
      .values({
        employeeId,
        workPlaceId,
        checkInAt: now,
        checkInLat: body.lat,
        checkInLng: body.lng,
        checkInAccuracy: body.accuracy ?? null,
        checkInIsMocked: body.isMocked ?? null,
        checkInDeviceType: body.deviceType,
        checkInType,
        status: "WORKING",
      })
      .returning();
    return created;
  } catch (e) {
    // 동시 요청으로 인한 중복 출근 레이스는 부분 유니크 인덱스(attendance_logs_working_employee_idx)가 막는다.
    // 이 경우도 에러 대신 그 사이 만들어진 기존 WORKING 기록을 반환해 멱등성을 유지한다.
    if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) {
      const winner = await db.query.attendanceLogs.findFirst({
        where: and(eq(attendanceLogs.employeeId, employeeId), eq(attendanceLogs.status, "WORKING")),
      });
      if (winner) return winner;
    }
    throw e;
  }
}

export async function checkOut(db: Db, employeeId: string, jobType: JobType, body: CheckPayload) {
  const existing = await db.query.attendanceLogs.findFirst({
    where: and(eq(attendanceLogs.employeeId, employeeId), eq(attendanceLogs.status, "WORKING")),
  });
  if (!existing) {
    // 네트워크 재시도로 퇴근 요청이 중복 도착한 경우: 이미 처리된(DONE) 가장 최근 기록이면
    // 에러 대신 그대로 반환한다(멱등 처리). 출근 기록 자체가 없으면 여전히 에러.
    const mostRecent = await db.query.attendanceLogs.findFirst({
      where: eq(attendanceLogs.employeeId, employeeId),
      orderBy: (l, { desc }) => [desc(l.checkInAt)],
    });
    if (mostRecent && mostRecent.status === "DONE") return mostRecent;
    throw new AttendanceError("출근 기록이 없습니다.", 400);
  }

  const nearest = await findNearestActiveWorkPlace(db, body.lat, body.lng);
  if (!nearest && requiresRadiusCheck(jobType, "checkOut")) {
    throw new AttendanceError("지정된 근무지 100m 이내에서만 퇴근할 수 있습니다.", 403);
  }
  const checkOutType: "NORMAL" | "FIELD" = nearest ? "NORMAL" : "FIELD";

  const now = new Date().toISOString();
  const updates = {
    checkOutAt: now,
    checkOutLat: body.lat,
    checkOutLng: body.lng,
    checkOutAccuracy: body.accuracy ?? null,
    checkOutIsMocked: body.isMocked ?? null,
    checkOutDeviceType: body.deviceType,
    checkOutType,
    status: "DONE" as const,
  };
  await db.update(attendanceLogs).set(updates).where(eq(attendanceLogs.id, existing.id));

  return { ...existing, ...updates };
}
