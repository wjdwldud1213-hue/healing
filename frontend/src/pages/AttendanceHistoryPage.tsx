import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import type { LeaveBalance, LeaveRequest } from "../types";

// 지금은 연차만 있지만, 출퇴근 기록이 생기면 여기에 타입을 추가하면 된다.
// 달력 한 칸(날짜)에 여러 종류의 기록이 동시에 들어갈 수 있도록 배열로 둔다.
type DayRecordType = "LEAVE_APPROVED" | "LEAVE_PENDING";

type DayRecord = {
  type: DayRecordType;
  label: string;
  detail: string | null;
  request: LeaveRequest;
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 양력 고정 공휴일 — 매년 날짜가 같아서 월-일만으로 어느 해든 계산 가능하다.
const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "크리스마스",
};

// 설날/추석/부처님오신날(음력 기준)과 대체공휴일은 해마다 날짜가 달라 미리 계산할 수 없다.
// 확인된 연도만 채워두고, 목록에 없는 해는 음력 공휴일이 표시되지 않는다(양력 고정 공휴일은 계속 표시됨).
const LUNAR_AND_SUBSTITUTE_HOLIDAYS: Record<string, string> = {
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-02": "대체공휴일(삼일절)",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일(부처님오신날)",
  "2026-08-17": "대체공휴일(광복절)",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-05": "대체공휴일(개천절)",
  "2027-02-06": "설날 연휴",
  "2027-02-07": "설날",
  "2027-02-08": "설날 연휴",
  "2027-02-09": "대체공휴일(설날)",
  "2027-05-13": "부처님오신날",
  "2027-08-16": "대체공휴일(광복절)",
  "2027-09-14": "추석 연휴",
  "2027-09-15": "추석",
  "2027-09-16": "추석 연휴",
  "2027-10-04": "대체공휴일(개천절)",
  "2027-10-11": "대체공휴일(한글날)",
  "2027-12-27": "대체공휴일(크리스마스)",
};

function getHolidayName(dateStr: string): string | null {
  return LUNAR_AND_SUBSTITUTE_HOLIDAYS[dateStr] ?? FIXED_HOLIDAYS[dateStr.slice(5)] ?? null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// startDate~endDate(포함) 사이의 모든 날짜 문자열을 만든다.
function eachDateInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export function AttendanceHistoryPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1~12
  const yearOptions = useMemo(
    () => Array.from({ length: 3 }, (_, i) => today.getFullYear() - 1 + i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<LeaveRequest[]>("/leave/requests").then(setRequests).catch((e) => setError(e.message));
    api.get<LeaveBalance[]>("/leave/balance").then(setBalances).catch((e) => setError(e.message));
  }, []);

  // 날짜(YYYY-MM-DD) -> 그 날의 기록 목록. 연차만 있는 지금은 신청 기간을 하루씩 펼쳐서 채운다.
  const recordsByDate = useMemo(() => {
    const map = new Map<string, DayRecord[]>();
    for (const req of requests) {
      if (req.status === "REJECTED") continue;
      const type: DayRecordType = req.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_PENDING";
      const label = req.status === "APPROVED" ? "연차" : "연차(대기)";
      for (const dateStr of eachDateInRange(req.startDate, req.endDate)) {
        const list = map.get(dateStr) ?? [];
        list.push({ type, label, detail: req.reason, request: req });
        map.set(dateStr, list);
      }
    }
    return map;
  }, [requests]);

  const balanceForYear = balances.find((b) => b.year === viewYear);
  const granted = balanceForYear ? balanceForYear.grantedDays + balanceForYear.carriedOverDays : 0;
  const used = balanceForYear ? balanceForYear.usedDays : 0;
  const remaining = granted - used;

  // "이번 달 사용": 신청서 하나의 일수를 날짜별로 쪼갤 방법이 없어 시작일 기준으로 그 달 것으로 집계한다(근사치).
  const usedThisMonth = requests
    .filter((r) => r.status === "APPROVED" && r.startDate.startsWith(`${viewYear}-${pad2(viewMonth)}`))
    .reduce((sum, r) => sum + r.days, 0);

  const minYear = yearOptions[0];
  const maxYear = yearOptions[yearOptions.length - 1];

  function goToMonth(delta: number) {
    let y = viewYear;
    let m = viewMonth + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    if (y < minYear || y > maxYear) return;
    setViewYear(y);
    setViewMonth(m);
  }

  // 네이버/구글 캘린더처럼 이전·다음 달의 앞뒤 날짜도 흐리게 채워서 항상 꽉 찬 격자로 보여준다.
  const weeks = useMemo(() => {
    type Cell = { day: number; dateStr: string; inMonth: boolean };

    const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth - 1, 1));
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
    const startWeekday = firstOfMonth.getUTCDay(); // 0=일

    const prevMonthDays = new Date(Date.UTC(viewYear, viewMonth - 1, 0)).getUTCDate();
    const prevMonthYear = viewMonth === 1 ? viewYear - 1 : viewYear;
    const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
    const nextMonthYear = viewMonth === 12 ? viewYear + 1 : viewYear;
    const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1;

    const cells: Cell[] = [];
    for (let i = 0; i < startWeekday; i++) {
      const day = prevMonthDays - startWeekday + 1 + i;
      cells.push({ day, dateStr: toDateStr(prevMonthYear, prevMonth, day), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, dateStr: toDateStr(viewYear, viewMonth, d), inMonth: true });
    }
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ day: nextDay, dateStr: toDateStr(nextMonthYear, nextMonth, nextDay), inMonth: false });
      nextDay++;
    }

    const result: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    return result;
  }, [viewYear, viewMonth]);

  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
  }

  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const selectedRecords = selectedDate ? (recordsByDate.get(selectedDate) ?? []) : [];

  return (
    <section>
      <h2>근태내역조회</h2>
      <p className="hint">
        날짜별 근태 기록을 달력으로 확인합니다. 지금은 연차 사용/신청 내역만 표시되며, 출퇴근
        기록이 추가되면 같은 달력에 함께 표시됩니다.
      </p>

      <div className="card">
        <h3>{viewYear}년 {viewMonth}월 연차 현황</h3>
        <table>
          <thead>
            <tr>
              <th>발생</th>
              <th>사용</th>
              <th>잔여</th>
              <th>이번 달 사용</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{granted}</td>
              <td>{used}</td>
              <td>{remaining}</td>
              <td>{usedThisMonth}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <div className="calendar-header">
          <button type="button" onClick={() => goToMonth(-1)}>
            ‹ 이전 달
          </button>
          <div className="calendar-jump">
            <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}>
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
            <button type="button" onClick={goToToday}>
              오늘
            </button>
          </div>
          <button type="button" onClick={() => goToMonth(1)}>
            다음 달 ›
          </button>
        </div>

        <table className="calendar-table">
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((w, idx) => (
                <th key={w} className={idx === 0 ? "sunday-label" : idx === 6 ? "saturday-label" : undefined}>
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, i) => (
              <tr key={i}>
                {week.map((cell, j) => {
                  const dayRecords = recordsByDate.get(cell.dateStr) ?? [];
                  const holidayName = getHolidayName(cell.dateStr);
                  const isToday = cell.dateStr === todayStr;
                  const dayNumClass = !cell.inMonth
                    ? "other-month"
                    : isToday
                      ? "is-today"
                      : holidayName || j === 0
                        ? "holiday"
                        : j === 6
                          ? "saturday"
                          : "";
                  return (
                    <td
                      key={j}
                      className={`calendar-cell${isToday ? " today" : ""}${dayRecords.length ? " has-record" : ""}${!cell.inMonth ? " other-month" : ""}`}
                      onClick={() => setSelectedDate(cell.dateStr)}
                    >
                      <span className={`calendar-day-num${dayNumClass ? ` ${dayNumClass}` : ""}`}>
                        {cell.day}
                      </span>
                      {cell.inMonth && holidayName && (
                        <span className="calendar-holiday-name">{holidayName}</span>
                      )}
                      {dayRecords.map((r, idx) => (
                        <span
                          key={idx}
                          className={`calendar-badge ${r.type === "LEAVE_APPROVED" ? "approved" : "pending"}`}
                        >
                          {r.label}
                        </span>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedDate && (
        <Modal onClose={() => setSelectedDate(null)}>
          <div className="card">
            <h3>{selectedDate} 상세 내역</h3>
            {selectedRecords.length === 0 && <p className="hint">이 날짜에는 기록이 없습니다.</p>}
            {selectedRecords.map((r, idx) => (
              <p key={idx}>
                <b>{r.label}</b> — {r.request.startDate} ~ {r.request.endDate} ({r.request.days}일)
                {r.detail && <> / 사유: {r.detail}</>}
              </p>
            ))}
            <div className="form-actions">
              <button type="button" onClick={() => setSelectedDate(null)}>
                닫기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
