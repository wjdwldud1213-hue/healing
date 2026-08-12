import { eq, sql } from "drizzle-orm";
import { departmentCodeSequences } from "../db/schema";
import type { Db } from "./db";

/**
 * 부서코드에 해당하는 채번 카운터를 1 증가시키고, 새 값으로 사번을 만든다.
 * UPDATE ... RETURNING 한 문장으로 처리해서, D1이 쓰기를 순서대로 처리하는
 * 특성만으로도 두 명이 동시에 등록해도 사번이 겹치지 않는다.
 */
export async function generateEmployeeId(db: Db, departmentCode: string): Promise<string> {
  const rows = await db
    .update(departmentCodeSequences)
    .set({ lastSeq: sql`${departmentCodeSequences.lastSeq} + 1` })
    .where(eq(departmentCodeSequences.departmentCode, departmentCode))
    .returning({ lastSeq: departmentCodeSequences.lastSeq });

  const row = rows[0];
  if (!row) {
    throw new Error(`등록되지 않은 부서코드입니다: ${departmentCode}`);
  }

  return `${departmentCode}${String(row.lastSeq).padStart(4, "0")}`;
}

/** 임시 비밀번호 발급용 — 요청에 따라 모든 신규 발급/재설정에 고정값을 사용한다. */
export function generateTempPassword(): string {
  return "qwer1234!";
}
