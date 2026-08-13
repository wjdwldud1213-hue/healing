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

export function AttendanceHistoryPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1~12
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
    setViewYear(y);
    setViewMonth(m);
  }

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth - 1, 1));
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
    const startWeekday = firstOfMonth.getUTCDay(); // 0=일

    const cells: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateStr: toDateStr(viewYear, viewMonth, d) });
    while (cells.length % 7 !== 0) cells.push(null);

    const result: Array<Array<{ day: number; dateStr: string } | null>> = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    return result;
  }, [viewYear, viewMonth]);

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
          <h3>
            {viewYear}년 {viewMonth}월
          </h3>
          <button type="button" onClick={() => goToMonth(1)}>
            다음 달 ›
          </button>
        </div>

        <table className="calendar-table">
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((w) => (
                <th key={w}>{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, i) => (
              <tr key={i}>
                {week.map((cell, j) => {
                  if (!cell) return <td key={j} className="calendar-cell empty" />;
                  const dayRecords = recordsByDate.get(cell.dateStr) ?? [];
                  return (
                    <td
                      key={j}
                      className={`calendar-cell${cell.dateStr === todayStr ? " today" : ""}${dayRecords.length ? " has-record" : ""}`}
                      onClick={() => setSelectedDate(cell.dateStr)}
                    >
                      <span className="calendar-day-num">{cell.day}</span>
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
