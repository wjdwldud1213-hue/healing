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

// 입사일 + n개월째 월급여일(월 앙니버서리)을 구한다. 대상 월에 그 날짜가 없으면(예: 31일생 2월)
// 그 달의 마지막 날로 당긴다. 배치가 몇 달씩 늦게 돌아도 각 회차가 "실제로 발생한 날짜"의
// 연도에 정확히 귀속되도록 하기 위함이다(배치를 실행한 날짜가 아니라).
function addMonthsClamped(
  hire: { year: number; month: number; day: number },
  n: number,
): { year: number; month: number; day: number; dateStr: string } {
  const totalMonths = hire.month - 1 + n;
  const year = hire.year + Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(hire.day, daysInMonth);
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, dateStr };
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
export async function grantLeave(
  db: Db,
  employeeId: string,
  year: number,
  days: number,
  reason: string,
  effectiveDate: string,
  createdBy?: string,
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
  await db.insert(leaveGrants).values({ employeeId, year, days, reason, effectiveDate, createdBy });
}

/**
 * 직원 한 명 기준으로 "오늘"까지 아직 발생시키지 않은 연차를 전부 채운다.
 * 1) 입사 1년 미만: 매월 만근 시 1일(최대 11일) — 재직 중이면 만근으로 간주.
 *    각 회차는 실제 월 앙니버서리 날짜(addMonthsClamped)의 연도에 귀속시킨다 — 배치/호출을
 *    실행한 날짜의 연도로 몰아넣지 않는다. 예: 2025-02-10 입사자는 2025년에 10일,
 *    2026-01-10에 11번째(2026년 귀속) 1일이 발생해야 정확하다.
 * 2) 입사 1년 이상의 연간 연차(첫 해는 비례, 3년차부터 2년마다 가산, 최대 25일) — hireYear+1부터
 *    오늘 연도까지 아직 발생시키지 않은 연도가 있으면 전부 채운다. "오늘이 1월 1일인지"로 판단하지
 *    않는다 — 여러 해를 놓쳤어도(신규 등록 시점에 처음 호출되는 경우 포함) 그만큼 소급 발생시키기 위함이다.
 * leave_grants에 이미 남은 이력 개수/연도를 기준으로 판단하므로 몇 번을 호출해도, 며칠/몇 년이
 * 지나서 호출해도 중복 없이 부족분만큼만 채운다(멱등) — 그래서 매일 도는 배치와 직원 등록 시점의
 * 즉시 호출이 같은 함수를 안전하게 공유할 수 있다.
 */
async function accrueLeaveForEmployee(
  db: Db,
  emp: { employeeId: string; hireDate: string },
  today: { year: number; month: number; day: number },
): Promise<number> {
  let grantedEvents = 0;
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
      const anniversary = addMonthsClamped(hire, monthIndex);
      await grantLeave(
        db,
        emp.employeeId,
        anniversary.year,
        1,
        `${MONTHLY_REASON_PREFIX} (${monthIndex}개월차)`,
        anniversary.dateStr,
      );
      grantedEvents++;
    }
  }

  const grantedAnnualYears = await db
    .select()
    .from(leaveGrants)
    .where(
      and(
        eq(leaveGrants.employeeId, emp.employeeId),
        like(leaveGrants.reason, `${ANNUAL_REASON_PREFIX}%`),
      ),
    );
  const grantedYearSet = new Set(grantedAnnualYears.map((g) => g.year));

  for (let year = hire.year + 1; year <= today.year; year++) {
    if (grantedYearSet.has(year)) continue;
    const days = computeAnnualGrantDays(emp.hireDate, year);
    if (days != null && days > 0) {
      await grantLeave(db, emp.employeeId, year, days, ANNUAL_REASON_PREFIX, `${year}-01-01`);
      grantedEvents++;
    }
  }

  return grantedEvents;
}

// 매일 실행되는 배치. 재직 중인 전 직원에 대해 accrueLeaveForEmployee를 돈다.
export async function runLeaveAccrualBatch(db: Db): Promise<{ grantedEvents: number }> {
  const today = kstToday();
  let grantedEvents = 0;

  const activeEmployees = await db
    .select()
    .from(employees)
    .where(ne(employees.employmentStatus, "RESIGNED"));

  for (const emp of activeEmployees) {
    grantedEvents += await accrueLeaveForEmployee(db, emp, today);
  }

  return { grantedEvents };
}

// 직원 등록 시점에 바로 호출한다 — 다음 날 자정 배치를 기다리지 않고 입사일 기준으로 밀린 연차를
// (입사일이 과거라면 그만큼 소급해서) 즉시 반영하기 위함. accrueLeaveForEmployee와 동일 로직이라
// 배치가 나중에 다시 돌아도 중복 발생하지 않는다.
export async function accrueLeaveForNewEmployee(
  db: Db,
  employeeId: string,
  hireDate: string,
): Promise<{ grantedEvents: number }> {
  const today = kstToday();
  const grantedEvents = await accrueLeaveForEmployee(db, { employeeId, hireDate }, today);
  return { grantedEvents };
}
