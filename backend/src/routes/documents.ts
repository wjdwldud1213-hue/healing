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

// 일부 분류는 공개범위가 고정이다 — 보건증은 식품위생 확인 등을 위해 전체공개,
// 등본은 주소/가족관계 등 민감정보라 관리자공개로 강제한다. "기타"만 자유 선택.
const FIXED_VISIBILITY_BY_CATEGORY: Partial<Record<Category, "PUBLIC" | "DEPARTMENT" | "ADMIN">> = {
  보건증: "PUBLIC",
  주민등록등본: "ADMIN",
};

async function canSeeDocument(
  db: ReturnType<typeof getDb>,
  actorId: string,
  doc: { employeeId: string; visibility: "PUBLIC" | "DEPARTMENT" | "ADMIN" },
) {
  if (doc.visibility === "PUBLIC") return true;
  if (doc.employeeId === actorId) return true;
  const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
  if (doc.visibility === "DEPARTMENT") {
    const uploader = await db.query.employees.findFirst({ where: eq(employees.employeeId, doc.employeeId) });
    if (uploader && uploader.departmentId === actor!.departmentId) return true;
  }
  const codes = await getPermissionCodes(db, actor!.roleId);
  return codes.has("EMPLOYEE_WRITE");
}

documentsRoute.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const actorId = c.get("currentUserId")!;
  const actor = await db.query.employees.findFirst({ where: eq(employees.employeeId, actorId) });
  const codes = await getPermissionCodes(db, actor!.roleId);

  const candidateRows = await db.query.documents.findMany({
    where: codes.has("EMPLOYEE_WRITE")
      ? undefined
      : or(
          eq(documents.visibility, "PUBLIC"),
          eq(documents.visibility, "DEPARTMENT"),
          eq(documents.employeeId, actorId),
        ),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    with: {
      employee: {
        columns: { employeeId: true, name: true },
        with: { department: { columns: { id: true, name: true } } },
      },
    },
  });

  // DEPARTMENT 공개는 SQL where절만으로 부서 일치까지 걸러내기 어려워, 이미 함께 가져온
  // employee.department로 여기서 마저 필터링한다(관리자는 애초에 전체를 봐도 되므로 제외).
  const rows = codes.has("EMPLOYEE_WRITE")
    ? candidateRows
    : candidateRows.filter(
        (doc) =>
          doc.visibility !== "DEPARTMENT" ||
          doc.employeeId === actorId ||
          doc.employee.department.id === actor!.departmentId,
      );

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
  const validFrom = form.get("validFrom");
  const validUntil = form.get("validUntil");

  if (!(file instanceof File)) return c.json({ error: "파일을 선택하세요." }, 400);
  if (file.size === 0) return c.json({ error: "빈 파일은 업로드할 수 없습니다." }, 400);
  if (file.size > MAX_FILE_SIZE) return c.json({ error: "파일 크기는 10MB를 넘을 수 없습니다." }, 400);
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json({ error: "이미지(jpg/png/webp) 또는 PDF만 업로드할 수 있습니다." }, 400);
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as Category)) {
    return c.json({ error: "카테고리를 선택하세요." }, 400);
  }
  if (visibility !== "PUBLIC" && visibility !== "DEPARTMENT" && visibility !== "ADMIN") {
    return c.json({ error: "공개범위를 선택하세요." }, 400);
  }
  if (
    (typeof validFrom === "string" && validFrom) &&
    (typeof validUntil === "string" && validUntil) &&
    validFrom > validUntil
  ) {
    return c.json({ error: "유효기간 종료일은 시작일보다 빠를 수 없습니다." }, 400);
  }

  // 프론트가 분류별 고정 공개범위를 선택 못 하게 막아도, 여기서 다시 강제해야 우회를 막는다.
  const fixedVisibility = FIXED_VISIBILITY_BY_CATEGORY[category as Category];
  const finalVisibility = fixedVisibility ?? visibility;
  // 유효기간은 보건증에서만 의미가 있다 — 다른 분류로 보내져도 서버가 무시하고 null로 둔다.
  const hasValidPeriod = category === "보건증";

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
      visibility: finalVisibility,
      validFrom: hasValidPeriod && typeof validFrom === "string" && validFrom ? validFrom : null,
      validUntil: hasValidPeriod && typeof validUntil === "string" && validUntil ? validUntil : null,
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
