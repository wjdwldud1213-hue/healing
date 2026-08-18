import { Hono } from "hono";
import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "../lib/db";
import { getPermissionCodes } from "../lib/permissions";
import { documents, employees } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const documentsRoute = new Hono<AppEnv>();
documentsRoute.use("*", requireAuth);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const CATEGORIES = ["주민등록등본", "보건증", "기타"] as const;
type Category = (typeof CATEGORIES)[number];

async function canSeeDocument(
  db: ReturnType<typeof getDb>,
  actorId: string,
  doc: { employeeId: string; visibility: "PUBLIC" | "ADMIN" },
) {
  if (doc.visibility === "PUBLIC") return true;
  if (doc.employeeId === actorId) return true;
  const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
  const codes = await getPermissionCodes(db, actor!.roleId);
  return codes.has("EMPLOYEE_WRITE");
}

documentsRoute.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;
  const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
  const codes = await getPermissionCodes(db, actor!.roleId);

  const rows = await db.query.documents.findMany({
    where: codes.has("EMPLOYEE_WRITE")
      ? undefined
      : or(eq(documents.visibility, "PUBLIC"), eq(documents.employeeId, actorId)),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    with: { employee: { columns: { employeeId: true, name: true } } },
  });

  return c.json(rows);
});

documentsRoute.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "잘못된 요청입니다." }, 400);

  const file = form.get("file");
  const category = form.get("category");
  const visibility = form.get("visibility");

  if (!(file instanceof File)) return c.json({ error: "파일을 선택하세요." }, 400);
  if (file.size === 0) return c.json({ error: "빈 파일은 업로드할 수 없습니다." }, 400);
  if (file.size > MAX_FILE_SIZE) return c.json({ error: "파일 크기는 10MB를 넘을 수 없습니다." }, 400);
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json({ error: "이미지(jpg/png/webp) 또는 PDF만 업로드할 수 있습니다." }, 400);
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as Category)) {
    return c.json({ error: "카테고리를 선택하세요." }, 400);
  }
  if (visibility !== "PUBLIC" && visibility !== "ADMIN") {
    return c.json({ error: "공개범위를 선택하세요." }, 400);
  }

  const storageKey = `${actorId}/${crypto.randomUUID()}-${file.name}`;
  await c.env.DOCUMENTS.put(storageKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const [created] = await db
    .insert(documents)
    .values({
      employeeId: actorId,
      category: category as Category,
      fileName: file.name,
      storageKey,
      mimeType: file.type,
      fileSize: file.size,
      visibility,
    })
    .returning();

  return c.json(created, 201);
});

documentsRoute.get("/:id/download", async (c) => {
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;
  const id = Number(c.req.param("id"));

  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc) return c.json({ error: "파일을 찾을 수 없습니다." }, 404);
  if (!(await canSeeDocument(db, actorId, doc))) {
    return c.json({ error: "조회 권한이 없습니다." }, 403);
  }

  const object = await c.env.DOCUMENTS.get(doc.storageKey);
  if (!object) return c.json({ error: "파일을 찾을 수 없습니다." }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
    },
  });
});

documentsRoute.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;
  const id = Number(c.req.param("id"));

  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc) return c.json({ error: "파일을 찾을 수 없습니다." }, 404);

  if (doc.employeeId !== actorId) {
    const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
    const codes = await getPermissionCodes(db, actor!.roleId);
    if (!codes.has("EMPLOYEE_WRITE")) return c.json({ error: "삭제 권한이 없습니다." }, 403);
  }

  await c.env.DOCUMENTS.delete(doc.storageKey);
  await db.delete(documents).where(eq(documents.id, id));

  return c.json({ ok: true });
});
