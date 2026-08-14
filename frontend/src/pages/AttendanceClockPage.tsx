import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { webGeoProvider } from "../lib/geolocation";
import type { GeoPosition } from "../lib/geolocation";
import type { AttendanceLog, JobType, WorkPlace } from "../types";

const CHECK_TYPE_LABEL: Record<string, string> = {
  NORMAL: "정상",
  FIELD: "현장",
  MANUAL: "수기",
};

// 백엔드 lib/attendance.ts의 requiresRadiusCheck와 동일한 규칙 — 여기서는 버튼 활성화 안내용으로만 쓰고,
// 최종 판단은 서버가 좌표를 재검증해서 내린다.
function requiresRadiusCheck(jobType: JobType, action: "checkIn" | "checkOut"): boolean {
  if (jobType === "OFFICE") return true;
  if (jobType === "DELIVERY") return action === "checkIn";
  return false;
}

function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// OFFICE/DELIVERY 출근은 반경이 필수라 항상 "출근"이지만, 반경이 필수가 아닌 경우(SALES 출퇴근,
// DELIVERY 퇴근)는 실시간 반경 안/밖 여부에 따라 문구가 바뀐다 — 백엔드 checkIn/checkOut과 동일 판단.
function checkInLabel(jobType: JobType, withinRadius: boolean) {
  if (jobType !== "SALES") return "출근";
  return withinRadius ? "출근" : "현장출근";
}

function checkOutLabel(jobType: JobType, withinRadius: boolean) {
  if (jobType === "OFFICE") return "퇴근";
  return withinRadius ? "퇴근" : "현장퇴근";
}

export function AttendanceClockPage() {
  const { currentUser } = useAuth();
  const jobType = currentUser?.jobType ?? "OFFICE";

  const [workPlaces, setWorkPlaces] = useState<WorkPlace[]>([]);
  const [status, setStatus] = useState<AttendanceLog | null>(null);
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function loadStatus() {
    api.get<AttendanceLog | null>("/attendance/status").then(setStatus).catch((e) => setError(e.message));
  }

  function refreshPosition() {
    setPositionError(null);
    webGeoProvider
      .getCurrentPosition()
      .then(setPosition)
      .catch((e) => setPositionError((e as Error).message));
  }

  useEffect(() => {
    api.get<WorkPlace[]>("/work-places").then(setWorkPlaces).catch((e) => setError(e.message));
    loadStatus();
    refreshPosition();
  }, []);

  // 반경 안에 있는지 여부와 무관하게 가장 가까운 근무지 하나와 거리를 계산해 둔다.
  // 반경 밖일 때 "근무지까지 OOm" 안내에 쓰기 위함 — 최종 반경 판단은 서버가 다시 한다.
  const nearest = useMemo(() => {
    if (!position || workPlaces.length === 0) return null;
    let best: { place: WorkPlace; distance: number } | null = null;
    for (const place of workPlaces) {
      const distance = haversineDistanceMeters(position.lat, position.lng, place.latitude, place.longitude);
      if (!best || distance < best.distance) best = { place, distance };
    }
    return best;
  }, [position, workPlaces]);

  const withinRadius = nearest != null && nearest.distance <= nearest.place.radiusM;

  const isWorking = status?.status === "WORKING";
  const checkInNeedsRadius = requiresRadiusCheck(jobType, "checkIn");
  const checkOutNeedsRadius = requiresRadiusCheck(jobType, "checkOut");

  const canCheckIn = !isWorking && (!checkInNeedsRadius || withinRadius);
  const canCheckOut = isWorking && (!checkOutNeedsRadius || withinRadius);

  async function handleCheckIn() {
    setError(null);
    setLoading(true);
    try {
      const pos = await webGeoProvider.getCurrentPosition();
      setPosition(pos);
      await api.post("/attendance/check-in", {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        deviceType: "WEB",
      });
      loadStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckOut() {
    setError(null);
    setLoading(true);
    try {
      const pos = await webGeoProvider.getCurrentPosition();
      setPosition(pos);
      await api.post("/attendance/check-out", {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        deviceType: "WEB",
      });
      loadStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>출근/퇴근</h2>
      <p className="hint">
        {jobType === "OFFICE" && "지정된 근무지 100m 이내에서만 출근/퇴근할 수 있습니다."}
        {jobType === "DELIVERY" &&
          "출근은 지정된 근무지 100m 이내에서만 가능하고, 퇴근은 위치와 관계없이 가능합니다(근무지 반경 안이면 퇴근, 밖이면 현장퇴근으로 기록)."}
        {jobType === "SALES" &&
          "위치와 관계없이 출근/퇴근할 수 있습니다(근무지 반경 안이면 출근/퇴근, 밖이면 현장출근/현장퇴근으로 기록)."}
      </p>

      {positionError && <p className="error">{positionError}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card">
        <h3>현재 상태</h3>
        {isWorking ? (
          <p>
            <b>{status!.checkInAt}</b>에 출근({CHECK_TYPE_LABEL[status!.checkInType]}) — 근무 중
          </p>
        ) : (
          <p className="hint">현재 출근 상태가 아닙니다.</p>
        )}

        <p className="hint">
          {position
            ? nearest
              ? withinRadius
                ? `"${nearest.place.name}" 반경 이내입니다 (약 ${Math.round(nearest.distance)}m).`
                : `근무지까지 ${Math.round(nearest.distance)}m (반경 밖)`
              : "등록된 근무지가 없습니다."
            : "위치 정보를 확인하는 중..."}
        </p>

        <div className="form-actions">
          <button type="button" disabled={!canCheckIn || loading} onClick={handleCheckIn}>
            {checkInLabel(jobType, withinRadius)}
          </button>
          <button type="button" disabled={!canCheckOut || loading} onClick={handleCheckOut}>
            {checkOutLabel(jobType, withinRadius)}
          </button>
          <button type="button" onClick={refreshPosition}>
            위치 새로고침
          </button>
        </div>
      </div>
    </section>
  );
}
