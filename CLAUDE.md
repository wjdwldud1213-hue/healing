# healing 프로젝트 (사내 그룹웨어)

식자재 유통 회사의 사내 인사/근태/권한 관리 그룹웨어. 로그인한 직원이 자신의 정보와 연차를 조회/신청하고, 관리자가 인사정보·부서·직급·권한·연차를 관리하는 웹 애플리케이션.

## 작업 원칙

- 모든 변경사항은 먼저 계획으로 설명하고, 사용자가 반영해달라고 말하기 전까지는 파일을 수정하거나 실행하지 않는다. 아래 "세션 시작/종료 규칙"의 "작업시작"도 이 원칙을 벗어나지 않는다 — 파일 수정이 필요한 작업이면 계획 제시가 먼저다.

## 기술 스택

- **Backend**: Cloudflare Workers + Hono + Cloudflare D1(SQLite) + Drizzle ORM. `wrangler.toml`에 매일 KST 00:00 실행되는 연차 자동발생 배치 cron 트리거 있음.
- **Frontend**: React 19 + React Router 7 + Vite 8. Cloudflare Pages(`healingfood`)로 배포.
- 인증: 세션 기반(`sessions` 테이블) + `bcryptjs` 비밀번호 해싱. idle timeout + "로그인 유지" 시 절대만료시각.

## 디렉터리 구조

```
backend/src/
  routes/       auth, departments, employees, leave, permissions, reference, roles,
                attendance(출근/퇴근/근태조회), workPlaces(근무지 CRUD)
  lib/          db, employeeId(사번 채번), leaveAccrual(연차 자동발생), leaveApproval(승인/반려),
                permissions, attendance(Haversine 거리계산 + 출퇴근 비즈니스 로직),
                geocode(카카오 로컬 API로 주소 -> 좌표 변환, work_places 등록/수정 시 서버가 대행)
  middleware/   auth, permission
  db/schema.ts  Drizzle 스키마 (도메인 규칙이 주석으로 문서화되어 있음)
  drizzle/      마이그레이션 (0000~0007)

frontend/src/
  pages/        LoginPage, HomePage, MyProfilePage, EmployeesPage, DepartmentsPage,
                ReferenceDataPage(직급/직책), RolesPage, AdminPasswordResetsPage,
                LeaveManagementPage(본인 연차), AdminLeaveRequestsPage(연차 승인),
                AttendanceHistoryPage(근태내역조회 달력), AttendanceClockPage(출근/퇴근),
                WorkPlacesPage(근무지 관리), ComingSoonPage(미구현 메뉴 placeholder — 현재 대상 없음)
  layout/       AppShell, menuData
  auth/         AuthContext, RequireAuth, RequirePermission
  components/   EmployeeForm, Modal
  lib/          geolocation(GeoProvider 인터페이스 + webGeoProvider 구현체 — 앱 전환 시 이 구현체만 교체)
  api/client.ts, types.ts
```

## 핵심 도메인 규칙

- **부서코드(A~Z)는 재배정 금지.** 이미 발급된 사번의 부서코드 의미가 바뀌면 안 되기 때문.
- **`employee_id`(사번)는 로그인 ID이며 발급 후 절대 불변.** 형식은 `[A-Z][0-9]{4}` (부서코드+순번).
- **퇴사 시 row를 삭제하지 않는다.** `employmentStatus`를 `ACTIVE → RESIGNED`로 바꿀 뿐. 부서/직급 이력은 `employee_assignment_history`에서 조회.
- **급여·연차발생은 append-only 이력 테이블로 관리.** `employee_compensations`, `leave_grants`에 이벤트마다 한 행씩 쌓고, "현재값"은 최신 행(또는 집계)으로 계산한다. `employees` 테이블에는 급여 등 "현재 상태" 필드를 두지 않는다.
- **연차 잔여 = `grantedDays + carriedOverDays - usedDays`** (`employee_leave_balances`, 연도별 집계).
- **연차 자동발생은 두 지점에서 트리거된다: ① 매일 KST 00:00 cron 배치(`runLeaveAccrualBatch`), ② 직원 등록 시점(`POST /employees`, `initialLeaveDays`를 관리자가 직접 입력하지 않은 경우).** 둘 다 `backend/src/lib/leaveAccrual.ts`의 `accrueLeaveForEmployee()`를 공유하므로, 과거 입사일(예: 시스템 도입 전부터 재직 중인 직원)을 등록해도 등록 즉시 입사일 기준으로 밀린 연차가 소급 계산되어 다음 자정 배치를 기다릴 필요가 없다. `leave_grants`에 이미 있는 이력(연도/개월차)을 기준으로 부족분만 채우는 멱등 설계라 두 트리거가 겹쳐 호출돼도 중복 발생하지 않는다. `initialLeaveDays`를 관리자가 직접 입력한 경우엔 자동 계산을 건너뛴다(수동 입력이 우선).
- 주의: `db/schema.ts`의 `leaveRequests` 주석은 "결재 기능 없음, 항상 PENDING"이라고 되어 있지만 **이는 오래된 주석이고 실제로는 승인/반려가 이미 구현되어 있음** (`backend/src/lib/leaveApproval.ts`, `AdminLeaveRequestsPage.tsx`). 스키마 주석보다 실제 코드를 신뢰할 것.
- **출근/퇴근 반경 검증은 직군(`employees.jobType`: `OFFICE`/`DELIVERY`/`SALES`)별로 다르다.** 사무직은 출근·퇴근 모두 `work_places` 반경(기본 100m) 이내에서만 가능, 배송직은 출근만 반경 검증(퇴근은 위치 무관 "현장퇴근"), 영업직은 출퇴근 모두 위치 제한 없음. 이 규칙은 `backend/src/lib/attendance.ts`의 `requiresRadiusCheck()`와 프론트 `AttendanceClockPage.tsx`의 동일 이름 함수 두 곳에 **의도적으로 중복 구현**되어 있음 — 프론트는 버튼 활성화 UX용 1차 판단이고, 서버가 항상 좌표를 재검증하는 최종 판단이다. 이 규칙을 바꿀 때는 두 곳 다 수정해야 함.
- **`attendance_logs`는 체크인/체크아웃 정보를 한 행에 담는다** (출근 시 insert, 퇴근 시 같은 행을 update) — `leaveRequests`처럼 상태별로 별도 행을 만들지 않음. `checkInAt`/`checkOutAt`은 항상 서버 `new Date().toISOString()`으로 기록하고 클라이언트가 보낸 시간은 신뢰하지 않는다.
- **출근/퇴근 API는 멱등(idempotent)하게 동작한다.** 이미 `WORKING` 상태인데 다시 출근을 시도하면(네트워크 재시도 등) 에러 대신 기존 기록을 그대로 반환하고, 이미 `DONE`인데 다시 퇴근을 시도해도 마찬가지다. 동시 요청 레이스는 `attendance_logs_working_employee_idx`(부분 유니크 인덱스, `WHERE status='WORKING'`)로 DB 레벨에서도 막는다.
- **Geolocation은 컴포넌트가 `navigator.geolocation`을 직접 쓰지 않고 항상 `frontend/src/lib/geolocation.ts`의 `GeoProvider` 인터페이스(`webGeoProvider` 구현체)를 통해서만 접근한다.** 추후 Capacitor/React Native로 전환할 때 이 구현체만 교체하면 되도록 설계됨.
- **연차관리/근태관리 관련 신규 권한 코드**: `LEAVE_APPROVE`, `LEAVE_MANAGE`, `ATTENDANCE_MANAGE`(근무지 CRUD + 타 직원 근태 조회) — 모두 `permissions.category = '근태관리'`.
- **`work_places` 등록/수정은 위도/경도를 직접 입력받지 않고 주소(`address`)만 입력받아 서버가 카카오 로컬 API로 지오코딩한다** (`backend/src/lib/geocode.ts`). API 키(`KAKAO_REST_API_KEY`)는 백엔드 시크릿으로만 보관하고 프론트에는 절대 노출하지 않음 — 그래서 지오코딩 호출은 항상 `POST/PATCH /work-places`에서 서버가 대행. 로컬 개발 시 `backend/.dev.vars`(gitignore됨, `.dev.vars.example` 참고)에 키를 넣어야 동작함. 카카오 디벨로퍼스 앱에서 "카카오맵" 제품이 활성화돼 있어야 API가 응답함(비활성 시 403 `OPEN_MAP_AND_LOCAL service disabled`).

## 기능 구현 상태

**완료됨** (오래된 순):
- 로그인/인증/세션 관리
- 홈 화면 UI (아이콘 레일 + 서브메뉴)
- 인사관리: 직원/부서/직급·직책/역할/권한 CRUD, 직급관리 스타일의 드래그 재정렬
- 비밀번호 재설정 승인 플로우 (관리자 승인/반려)
- 연차 관리: 신청/조회, 자동발생 배치(cron), **승인/반려까지 구현 완료** (커밋 `cde8a7a`, 연차 관리 STEP2~6)
- 연차 관리 화면 개편: 연차 신청 폼을 모달로 전환, 시작일/종료일 입력 시 일수 자동 계산, "연차 현황"을 총/사용/잔여 3개 통계 카드로 표시, 신청 목록을 연차 시작일 기준 내림차순 정렬 (커밋 `f64401b`)
- 근태내역조회 달력: 네이버/구글 캘린더 스타일 6주 그리드, 토요일 파란색/일요일·공휴일 빨간색 표기(공휴일명 함께 표시), 연/월 바로가기 + "오늘" 버튼 (커밋 `092b78b`)
- 근태내역조회 공휴일 데이터에 2027년 설날/추석/부처님오신날/대체공휴일 추가, 연도 이동 범위를 올해 기준 전년~후년 3개년으로 제한 (커밋 `ff581ce`)
- **출근/퇴근(근태 체크인) 기능 1단계**: `work_places`/`attendance_logs` 테이블 + `employees.jobType` 추가(마이그레이션 `0006`), 직군별 반경 검증 규칙(사무직 출퇴근 모두/배송직 출근만/영업직 없음) 서버·프론트 양쪽 구현, 출근/퇴근 API 멱등 처리, 근무지 관리 화면(`ATTENDANCE_MANAGE` 권한), 근태내역조회 달력에 출퇴근 기록 통합(KST 변환), `GeoProvider` 인터페이스로 위치 접근 추상화(웹 구현체만 작성, 앱 전환 대비). 원격 D1 마이그레이션 적용 + 백엔드/프론트엔드 배포 완료. 사무직 외근 예외신청/승인(2단계)은 스키마만 미리 확보해두고 미구현.
- **근무지 등록 주소 입력화**: `work_places`에 `address` 컬럼 추가(마이그레이션 `0007`), 위도/경도 수동 입력 대신 주소를 카카오 로컬 API로 지오코딩(`backend/src/lib/geocode.ts`)하도록 `WorkPlacesPage.tsx`/`POST·PATCH /work-places` 변경. `KAKAO_REST_API_KEY` 원격 시크릿 설정 + 배포 완료.
- **연차 자동발생을 직원 등록 시점에도 즉시 계산**: `leaveAccrual.ts`의 직원별 로직을 `accrueLeaveForEmployee()`로 분리해 매일 배치(`runLeaveAccrualBatch`)와 신규 등록(`accrueLeaveForNewEmployee`, `POST /employees`)이 공유하도록 변경. 과거 입사일로 등록된 직원(예: 시스템 도입 전부터 재직 중인 실제 직원 A0001, 2019-08-01 입사)도 등록 즉시 소급 계산되어 다음 자정 배치를 기다릴 필요가 없음. 배포 완료 + A0001 기존 데이터도 동일 로직으로 검증한 값을 원격 DB에 소급 반영 완료(2026년 잔여 18일).
- **근태내역조회에 관리자용 "직원 선택" 추가**: `ATTENDANCE_MANAGE` 권한 보유자(시스템관리자)는 `AttendanceHistoryPage.tsx` 상단 드롭다운에서 다른 직원을 선택해 그 직원의 연차 현황 + 출퇴근 기록을 같은 달력으로 조회 가능. `GET /leave/requests`, `GET /leave/balance`, `GET /attendance/logs`가 모두 `employeeId` 쿼리 파라미터를 지원하며, `ATTENDANCE_MANAGE`가 없으면 서버가 파라미터를 무시하고 항상 본인 것만 반환(연차 신청/취소 자체는 여전히 본인만 가능 — 조회만 확장됨). 배포 완료.

**미구현**: 없음 (`App.tsx`/`menuData.ts`의 `ComingSoonPage` 대상 메뉴가 현재 모두 실제 화면으로 연결됨). 향후 새 메뉴가 추가되면 다시 이 자리에 기록.

## 현재 작업 진행 상황 (수동 갱신 섹션)

> 기준: 2026-08-14. 출근/퇴근 기능 1단계 + 근무지 주소 지오코딩(커밋 `9bdc2e7`) + 연차 자동발생 등록시점 즉시 계산(커밋 `d6ddcee`) + **근태내역조회 관리자용 직원 선택**까지 전부 커밋·push·백엔드 Worker/프론트엔드 Pages 배포 완료, 로컬에서 관리자/일반직원 양쪽 권한 분기(서버사이드 강제 포함) 검증함. **단, `leave.ts`/`AttendanceHistoryPage.tsx` 변경분은 아직 git commit 전 — 워킹트리에 미커밋 상태로 남아있음.** 다음 세션 시작 시 커밋 여부부터 확인할 것. 이후 2단계(사무직 외근 예외신청/승인)를 시작하면 여기에 기록.

## 세션 시작/종료 규칙

사용자가 **"작업완료"**라고 말하면 (작업 세션을 마무리하는 시점):
1. `git status`, `git diff --stat`(및 필요 시 상세 diff), `git log`(직전 확인 시점 이후 커밋)를 확인해서 healing 폴더 전체의 현재 작업 상태를 최종적으로 파악한다.
2. 무엇이 완료(커밋)됐고, 무엇이 미커밋 상태로 남아있는지, 새로 추가/삭제/수정된 파일이 무엇인지 사용자에게 요약 보고한다.
3. 이 CLAUDE.md의 "기능 구현 상태"와 "현재 작업 진행 상황" 섹션을 실제 상태에 맞게 갱신한다 (완료된 항목은 기능 구현 상태로 옮기고, 남은 미커밋 작업은 현재 작업 진행 상황에 기록).

사용자가 **"작업시작"**이라고 말하면 (새 요청을 시작하는 시점):
1. 이 CLAUDE.md 파일 전체(프로젝트 개요, 기술 스택, 도메인 규칙, 기능 구현 상태, 현재 작업 진행 상황)를 먼저 숙지한다.
2. 이어서 사용자가 요청하는 작업에 대한 계획을 곧바로 세워 제시한다. (별도로 진행상황부터 보고하라고 요구하는 것이 아니라, 문서 내용을 배경지식으로 삼아 바로 계획 수립에 들어가라는 뜻 — 단, 위 "작업 원칙"에 따라 실제 파일 수정/실행은 사용자가 반영해달라고 말한 뒤에 한다.)

## 진행상황 갱신 규칙

기능을 커밋하거나 진행 상황이 바뀔 때마다 위 "현재 작업 진행 상황" 섹션을 최신 상태로 갱신할 것 (완료된 항목은 "기능 구현 상태"로 옮기고, 새로 시작한 미커밋 작업을 기록). 이 문서가 시간이 지나도 계속 유효하려면 이 갱신이 필수적임.
