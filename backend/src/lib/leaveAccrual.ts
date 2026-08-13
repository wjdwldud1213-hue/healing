import { and, eq, like, ne } from "drizzle-orm";
import type { Db } from "./db";
import { employeeLeaveBalances, employees, leaveGrants } from "../db/schema";

// 근태(출근/퇴근) 기록 기능이 아직 없어 "만근" 여부를 실제로 확인할 방법이 없다.
// 그래서 재직 중(퇴사 아님)이면 만근으로 간주한다 — 근태관리 기능이 생기면 이 가정을 실제 체크로 교체해야 한다.
const MONTHLY_REASON_PREFIX = "1년 미만 근속 월 연차";
const ANNUAL_REASON_PREFIX = "연차 자동발생";

function kstToday(): { year: number; month: number; day: number; dateStr: string } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, dateStr };
}

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

function fullMonthsElapsed(
  hire: { year: number; month: number; day: number },
  today: { year: number; month: number; day: number },
): number {
  let months = (today.year - hire.year) * 12 + (today.month - hire.month);
  if (today.day < hire.day) months -= 1;
  return Math.max(months, 0);
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * 근로기준법 제60조 기준 연간 발생일수(회계연도 관리).
 * - 입사연도(hireYear) 자체는 대상이 아니다(그 해는 월 단위 연차만 해당).
 * - 입사 다음 해(hireYear+1)는 재직기간에 비례: 15 × 재직일수/365.
 * - 그 다음부터는 15일 + (근속연수-1)/2 가산(내림), 최대 25일.
 */
export function computeAnnualGrantDays(hireDateStr: string, targetYear: number): number | null {
  const hire = parseDate(hireDateStr);
  if (targetYear <= hire.year) return null;

  if (targetYear === hire.year + 1) {
    const hireDateUTC = Date.UTC(hire.year, hire.month - 1, hire.day);
    const yearEndUTC = Date.UTC(hire.year, 11, 31);
    const daysEmployed = Math.floor((yearEndUTC - hireDateUTC) / 86400000) + 1;
    if (daysEmployed <= 0) return null;
    return roundToHalf(15 * (daysEmployed / 365));
  }

  const serviceYears = targetYear - hire.year;
  return Math.min(15 + Math.floor(Math.max(serviceYears - 1, 0) / 2), 25);
}

// employee_leave_balances(연도별 집계)에 반영하고 leave_grants(감사 이력)에 한 행 남긴다.
// 이월(carriedOverDays)은 정책상 항상 0으로 둔다 — 미사용 연차는 이월 없이 소멸.
async function grantLeave(
  db: Db,
  employeeId: string,
  year: number,
  days: number,
  reason: string,
  effectiveDate: string,
) {
  const existingBalance = await db.query.employeeLeaveBalances.findFirst({
    where: and(eq(employeeLeaveBalances.employeeId, employeeId), eq(employeeLeaveBalances.year, year)),
  });
  if (existingBalance) {
    await db
      .update(employeeLeaveBalances)
      .set({ grantedDays: existingBalance.grantedDays + days, updatedAt: new Date().toISOString() })
      .where(eq(employeeLeaveBalances.id, existingBalance.id));
  } else {
    await db.insert(employeeLeaveBalances).values({
      employeeId,
      year,
      grantedDays: days,
      usedDays: 0,
      carriedOverDays: 0,
    });
  }
  await db.insert(leaveGrants).values({ employeeId, year, days, reason, effectiveDate });
}

/**
 * 매일 실행되는 배치.
 * 1) 입사 1년 미만 직원: 매월 만근 시 1일(최대 11일) — 재직 중이면 만근으로 간주.
 * 2) 1월 1일: 입사 1년 이상 직원의 연간 연차(첫 해는 비례, 3년차부터 2년마다 가산, 최대 25일).
 * leave_grants에 이미 남은 이력 개수를 기준으로 판단하므로 하루에 여러 번/여러 날 실행돼도
 * 중복 발생하지 않는다(멱등) — 배치가 며칠 못 돌았어도 다음 실행에서 부족분만큼 자동으로 채운다.
 */
export async function runLeaveAccrualBatch(db: Db): Promise<{ grantedEvents: number }> {
  const today = kstToday();
  let grantedEvents = 0;

  const activeEmployees = await db
    .select()
    .from(employees)
    .where(ne(employees.employmentStatus, "RESIGNED"));

  for (const emp of activeEmployees) {
    const hire = parseDate(emp.hireDate);

    const monthsElapsed = fullMonthsElapsed(hire, today);
    const targetMonthlyGrants = Math.min(monthsElapsed, 11);
    if (targetMonthlyGrants > 0) {
      const alreadyGranted = await db
        .select()
        .from(leaveGrants)
        .where(
          and(
            eq(leaveGrants.employeeId, emp.employeeId),
            like(leaveGrants.reason, `${MONTHLY_REASON_PREFIX}%`),
          ),
        );
      const missing = targetMonthlyGrants - alreadyGranted.length;
      for (let i = 0; i < missing; i++) {
        const monthIndex = alreadyGranted.length + i + 1;
        await grantLeave(
          db,
          emp.employeeId,
          today.year,
          1,
          `${MONTHLY_REASON_PREFIX} (${monthIndex}개월차)`,
          today.dateStr,
        );
        grantedEvents++;
      }
    }

    if (today.month === 1 && today.day === 1) {
      const already = await db
        .select()
        .from(leaveGrants)
        .where(
          and(
            eq(leaveGrants.employeeId, emp.employeeId),
            eq(leaveGrants.year, today.year),
            like(leaveGrants.reason, `${ANNUAL_REASON_PREFIX}%`),
          ),
        );
      if (already.length === 0) {
        const days = computeAnnualGrantDays(emp.hireDate, today.year);
        if (days != null && days > 0) {
          await grantLeave(db, emp.employeeId, today.year, days, ANNUAL_REASON_PREFIX, today.dateStr);
          grantedEvents++;
        }
      }
    }
  }

  return { grantedEvents };
}
