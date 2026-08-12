import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { employees } from "../db/schema";
import { getPermissionCodes } from "../lib/permissions";
import type { AppEnv } from "../types";

/**
 * 메뉴(화면)뿐 아니라 API 자체에서도 권한을 확인한다.
 * requireAuth 뒤에 붙여서 쓴다 — 로그인한 사용자의 역할(role)이
 * role_permissions에 이 권한 코드를 가지고 있는지 매 요청마다 DB로 확인한다.
 */
export function requirePermission(code: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const employeeId = c.get("currentUserId");
    if (!employeeId) return c.json({ error: "로그인이 필요합니다." }, 401);

    const db = getDb(c.env.DB);
    const employee = await db.query.employees.findFirst({
      where: eq(employees.employeeId, employeeId),
    });
    if (!employee) return c.json({ error: "로그인이 필요합니다." }, 401);

    const codes = await getPermissionCodes(db, employee.roleId);
    if (!codes.has(code)) {
      return c.json({ error: "이 작업을 수행할 권한이 없습니다." }, 403);
    }
    await next();
  };
}
