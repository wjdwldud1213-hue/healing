import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { workPlaces } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { geocodeAddress } from "../lib/geocode";
import type { AppEnv } from "../types";

export const workPlacesRoute = new Hono<AppEnv>();
workPlacesRoute.use("*", requireAuth);

// 출퇴근 화면에서 반경 검증용으로 누구나 조회할 수 있어야 하므로 로그인만 요구한다.
// 좌표를 프론트에 하드코딩하지 않고 항상 이 API로 받는다(관리자가 반경/좌표를 바꾸면 즉시 반영됨).
workPlacesRoute.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const includeInactive = c.req.query("includeInactive") === "true";
  const rows = await db
    .select()
    .from(workPlaces)
    .where(includeInactive ? undefined : eq(workPlaces.isActive, true));
  return c.json(rows);
});

workPlacesRoute.post("/", requirePermission("ATTENDANCE_MANAGE"), async (c) => {
  const body = await c.req
    .json<{ name?: string; address?: string; radiusM?: number }>()
    .catch(() => ({}) as { name?: string; address?: string; radiusM?: number });

  const name = (body.name ?? "").trim();
  const address = (body.address ?? "").trim();
  if (!name) return c.json({ error: "근무지 이름을 입력하세요." }, 400);
  if (!address) return c.json({ error: "주소를 입력하세요." }, 400);

  let geocoded;
  try {
    geocoded = await geocodeAddress(c.env.KAKAO_REST_API_KEY, address);
  } catch {
    return c.json({ error: "주소 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, 502);
  }
  if (!geocoded) return c.json({ error: "주소를 찾을 수 없습니다. 다시 확인해주세요." }, 400);

  const db = getDb(c.env.DB);
  const [created] = await db
    .insert(workPlaces)
    .values({
      name,
      address,
      latitude: geocoded.lat,
      longitude: geocoded.lng,
      radiusM: body.radiusM ?? 100,
    })
    .returning();
  return c.json(created, 201);
});

workPlacesRoute.patch("/:id", requirePermission("ATTENDANCE_MANAGE"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "잘못된 ID입니다." }, 400);

  const body = await c.req
    .json<{ name?: string; address?: string; radiusM?: number; isActive?: boolean }>()
    .catch(() => ({}) as { name?: string; address?: string; radiusM?: number; isActive?: boolean });

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.radiusM === "number") updates.radiusM = body.radiusM;
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;

  if (typeof body.address === "string" && body.address.trim()) {
    const address = body.address.trim();
    let geocoded;
    try {
      geocoded = await geocodeAddress(c.env.KAKAO_REST_API_KEY, address);
    } catch {
      return c.json({ error: "주소 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, 502);
    }
    if (!geocoded) return c.json({ error: "주소를 찾을 수 없습니다. 다시 확인해주세요." }, 400);
    updates.address = address;
    updates.latitude = geocoded.lat;
    updates.longitude = geocoded.lng;
  }

  const db = getDb(c.env.DB);
  await db.update(workPlaces).set(updates).where(eq(workPlaces.id, id));

  const updated = await db.select().from(workPlaces).where(eq(workPlaces.id, id)).get();
  if (!updated) return c.json({ error: "찾을 수 없습니다." }, 404);
  return c.json(updated);
});
