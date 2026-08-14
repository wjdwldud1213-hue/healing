# healing 프로젝트 (사내 그룹웨어)

식자재 유통 회사의 사내 인사/근태/권한 관리 그룹웨어. 로그인한 직원이 자신의 정보와 연차를 조회/신청하고, 관리자가 인사정보·부서·직급·권한·연차를 관리하는 웹 애플리케이션.

## 작업 원칙

- 모든 변경사항은 먼저 계획으로 설명하고, 사용자가 반영해달라고 말하기 전까지는 파일을 수정하거나 실행하지 않는다. 아래 "세션 시작/종료 규칙"의 "작업시작"도 이 원칙을 벗어나지 않는다 — 파일 수정이 필요한 작업이면 계획 제시가 먼저다.

## 모바일 앱 전환 대비 원칙

- 이 그룹웨어는 웹으로 먼저 구현되지만, **추후 모바일 앱(Capacitor 또는 React Native 등)으로도 구현될 것을 염두에 두고 작업한다.**
- 브라우저 전용 API(위치, 카메라, 푸시 알림, 로컬 스토리지 등)를 컴포넌트에서 직접 호출하지 않고 인터페이스로 추상화한 뒤 웹 구현체를 그 인터페이스 뒤에 둔다. 앱 전환 시엔 인터페이스를 구현하는 새 provider만 추가하면 되도록 설계한다.
  - 이미 적용된 선례: `frontend/src/lib/geolocation.ts`의 `GeoProvider` 인터페이스 + `webGeoProvider` 구현체 (자세한 내용은 아래 "핵심 도메인 규칙" 참고).
- 새 기능을 설계할 때 "이 부분이 모바일 네이티브 API로 바뀔 수 있는가?"를 먼저 검토하고, 그렇다면 위와 같은 인터페이스 분리 패턴을 적용한다.

## 기술 스택

- **Backend**: Cloudflare Workers + Hono + Cloudflare D1(SQLite) + Drizzle ORM. `wrangler.toml`에 매일 KST 00:00 실행되는 연차 자동발생 배치 cron 트리거 있음.
- **Frontend**: React 19 + React Router 7 + Vite 8. Cloudflare Pages(`healingfood`)로 배포.
- 인증: 세션 기반(`sessions` 테이블) + `bcryptjs` 비밀번호 해싱. idle timeout + "로그인 유지" 시 절대만료시각.

## 배포 환경 (운영 / 스테이징)

- **운영**: 백엔드 Worker `healingfood-api` (D1 `groupware-db`), 프론트엔드 Pages/Workers 프로젝트 `healingfood` (`https://healingfood.healingfood.workers.dev`). `npm run deploy` (각 디렉터리에서).
- **스테이징(테스트)**: 완전히 분리된 백엔드 Worker `healingfood-api-test`(`backend/wrangler.toml`의 `[env.test]`, D1 `groupware-db-test`)와 프론트엔드 Pages/Workers 프로젝트 `healingfood-test` (`https://healingfood-test.healingfood.workers.dev`). 운영과 DB/Worker가 완전히 별개라 테스트 데이터가 운영에 절대 섞이지 않음.
  - 백엔드 배포: `cd backend && npm run deploy:test` (`wrangler deploy --env test`)
  - 백엔드 마이그레이션/시드: `npm run db:migrate:test`, `npm run db:seed:test` (+ `seed_leave_manage_permission.sql`/`seed_leave_approve_permission.sql`/`seed_attendance_manage_permission.sql`은 `wrangler d1 execute groupware-db-test --remote --env test --file=...`로 수동 적용)
  - 프론트엔드 배포: `cd frontend && npm run deploy:test` (`frontend/.env.test`의 `VITE_API_BASE`로 테스트 백엔드를 가리켜서 빌드 후 `wrangler pages deploy dist --project-name=healingfood-test`)
  - `frontend/.env.test`, `frontend/.env.production`은 `.gitignore`(`.env*`)에 걸려 git에 커밋되지 않음 — 로컬 디스크에만 존재. 새 환경에서 클론하면 다시 만들어야 함(운영 URL: `https://healingfood-api.healingfood.workers.dev`, 테스트 URL: `https://healingfood-api-test.healingfood.workers.dev`).
  - `backend/src/index.ts`의 CORS origin 배열에 두 프론트엔드 origin이 모두 등록돼 있음(같은 코드가 양쪽 Worker에 배포되므로 공유 리스트).
  - `KAKAO_REST_API_KEY` 시크릿은 Worker(환경)별로 따로 등록해야 함 — 운영에는 이미 있음, 테스트는 `wrangler secret put KAKAO_REST_API_KEY --env test`로 **사용자가 직접** 등록 필요(미등록 상태면 근무지 등록 시 지오코딩만 실패, 나머지 기능은 정상).
  - 연차 자동발생 cron도 테스트 환경에 동일하게 걸려 있음(운영과 별개로 테스트 DB 기준으로 매일 실행).

## 배포 자동화 규칙

- 개발 작업(코드 수정)이 완료되고 동작이 확인되면, **스테이징(테스트) 서버 배포는 별도로 승인받지 않고 자동으로 진행한다** — 백엔드 `npm run deploy:test`, 프론트엔드 `npm run deploy:test` (스키마 변경이 있었으면 마이그레이션/시드도 함께 적용). 이는 위 "작업 원칙"(파일 수정/실행은 승인 후에만)의 **예외이며, 테스트 서버 배포에 한정된다** — 코드 파일 자체의 수정은 여전히 계획 제시 → 사용자 승인 후에만 한다.
- 테스트 배포가 끝나면, **그 내용을 운영(본 서버)에도 반영할지 사용자에게 반드시 먼저 물어본다.** 운영 배포(`npm run deploy`)는 사용자가 명시적으로 승인한 경우에만 진행하고, 절대 자동으로 하지 않는다.

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
- **출근/퇴근 반경 검증은 직군(`employees.jobType`: `OFFICE`/`DELIVERY`/`SALES`)별로 "필수 여부"가 다르고, 필수가 아닌 경우에도 반경 결과로 자동 분류한다.** 사무직은 출근·퇴근 모두 `work_places` 반경(기본 100m) 안이 아니면 막힘(필수). 배송직은 출근만 필수, 퇴근은 막지 않음. 영업직은 출퇴근 모두 막지 않음. **"막지 않음"인 경우에도 실제로 반경 안이면 일반 출근/퇴근(`NORMAL`, 문구도 "출근/퇴근")으로, 밖이면 현장출근/현장퇴근(`FIELD`, 문구도 "현장출근/현장퇴근")으로 자동 기록된다** — 즉 반경 체크 자체는 항상 하되, 막을지 말지만 직군별로 다름. 이 규칙은 `backend/src/lib/attendance.ts`의 `requiresRadiusCheck()`+`checkIn`/`checkOut`과 프론트 `AttendanceClockPage.tsx`의 동일 이름 함수+`checkInLabel`/`checkOutLabel` 두 곳에 **의도적으로 중복 구현**되어 있음 — 프론트는 버튼 활성화/문구 UX용 1차 판단이고, 서버가 항상 좌표를 재검증하는 최종 판단이다. 이 규칙을 바꿀 때는 두 곳 다 수정해야 함.
- **`attendance_logs`는 체크인/체크아웃 정보를 한 행에 담는다** (출근 시 insert, 퇴근 시 같은 행을 update) — `leaveRequests`처럼 상태별로 별도 행을 만들지 않음. `checkInAt`/`checkOutAt`은 항상 서버 `new Date().toISOString()`으로 기록하고 클라이언트가 보낸 시간은 신뢰하지 않는다.
- **출근/퇴근 API는 멱등(idempotent)하게 동작한다.** 이미 `WORKING` 상태인데 다시 출근을 시도하면(네트워크 재시도 등) 에러 대신 기존 기록을 그대로 반환하고, 이미 `DONE`인데 다시 퇴근을 시도해도 마찬가지다. 동시 요청 레이스는 `attendance_logs_working_employee_idx`(부분 유니크 인덱스, `WHERE status='WORKING'`)로 DB 레벨에서도 막는다.
- **Geolocation은 컴포넌트가 `navigator.geolocation`을 직접 쓰지 않고 항상 `frontend/src/lib/geolocation.ts`의 `GeoProvider` 인터페이스(`webGeoProvider` 구현체)를 통해서만 접근한다.** 추후 Capacitor/React Native로 전환할 때 이 구현체만 교체하면 되도록 설계됨.
- **연차관리/근태관리 관련 신규 권한 코드**: `LEAVE_APPROVE`, `LEAVE_MANAGE`, `ATTENDANCE_MANAGE`(근무지 CRUD + 타 직원 근태 조회) — 모두 `permissions.category = '근태관리'`.
- **`work_places` 등록/수정은 위도/경도를 직접 입력받지 않고 주소(`address`)만 입력받아 서버가 카카오 로컬 API로 지오코딩한다** (`backend/src/lib/geocode.ts`). API 키(`KAKAO_REST_API_KEY`)는 백엔드 시크릿으로만 보관하고 프론트에는 절대 노출하지 않음 — 그래서 지오코딩 호출은 항상 `POST/PATCH /work-places`에서 서버가 대행. 로컬 개발 시 `backend/.dev.vars`(gitignore됨, `.dev.vars.example` 참고)에 키를 넣어야 동작함. 카카오 디벨로퍼스 앱에서 "카카오맵" 제품이 활성화돼 있어야 API가 응답함(비활성 시 403 `OPEN_MAP_AND_LOCAL service disabled`).

## 기능 구현 상태

**완료됨** (오래된 순, 상세 내역은 `git log`/`git show <해시>` 참고):
- 로그인/인증/세션 관리
- 홈 화면 UI (아이콘 레일 + 서브메뉴)
- 인사관리: 직원/부서/직급·직책/역할/권한 CRUD + 드래그 재정렬
- 비밀번호 재설정 승인 플로우
- 연차 관리: 신청/조회/자동발생 배치/승인·반려 (커밋 `cde8a7a`)
- 연차 관리 화면 개편: 모달 신청, 일수 자동계산, 통계 카드 (커밋 `f64401b`)
- 근태내역조회 달력: 네이버/구글 스타일 6주 그리드 + 공휴일 표기 (커밋 `092b78b`, `ff581ce`)
- 출근/퇴근 기능 1단계: 직군별 반경 검증 + 근무지 관리 + 근태내역 통합 (커밋 `d81ee70`) — 사무직 외근 예외신청/승인(2단계)은 스키마만 확보, 미구현
- 근무지 등록 주소 입력화 (카카오 지오코딩) (커밋 `9bdc2e7`)
- 연차 자동발생을 직원 등록 시점에도 즉시 계산 (커밋 `d6ddcee`)
- 근태내역조회에 관리자용 직원 선택 기능 (커밋 `9c4143d`)
- 영업직/배송직 출퇴근 반경 자동분류 (커밋 `1f44ab9`)
- PWA 설치 지원 + 모바일 전용 하단 탭바 레이아웃 (커밋 `ea4b1a8`)
- 운영과 완전히 분리된 스테이징(테스트) 환경 구축 (커밋 `4755745`, 자세한 사용법은 위 "배포 환경" 섹션 참고)
- 브라우저 탭 제목/파비콘 환경별 구분 (운영/테스트/로컬 각각 다른 타이틀·아이콘)
- 폼 입력창 폰트를 body와 통일 (`input, select, button { font-family: inherit }` — 지정 안 하면 브라우저 기본 폰트(Arial 등)로 렌더링돼 라벨/본문과 다르게 보였음, `type=date`의 크롬 shadow DOM 세그먼트는 별도 규칙 필요), 휴대폰번호/내선번호 입력 시 자동 하이픈 포맷(`frontend/src/lib/phone.ts`의 `formatPhoneNumber()` — 직원 등록/수정, 마이페이지, 비밀번호 재설정 요청 3곳에 공통 적용. 비밀번호 재설정 페이지는 서버가 정확 일치 비교라 포맷 안 맞으면 본인 번호를 맞게 입력해도 실패하는 실제 버그였음)

**미구현**: 없음 (`App.tsx`/`menuData.ts`의 `ComingSoonPage` 대상 메뉴가 현재 모두 실제 화면으로 연결됨). 향후 새 메뉴가 추가되면 다시 이 자리에 기록.

## 현재 작업 진행 상황 (수동 갱신 섹션)

> 기준: 2026-08-14. 휴대폰번호/내선번호 초기값(기존 저장값) 자동 하이픈 포맷(커밋 `10bcf14`)까지 커밋·push·운영/테스트 양쪽 배포 완료. **워킹트리 깨끗함 — 이 작업 관련 미커밋 변경 없음.** **미완료 항목: `KAKAO_REST_API_KEY` 테스트 환경 시크릿을 사용자가 아직 등록하지 않음** — `wrangler secret put KAKAO_REST_API_KEY --env test`를 backend 디렉터리에서 직접 실행해야 근무지 등록(지오코딩) 기능이 테스트 환경에서도 동작함. 그 외 기능은 이미 정상 동작.

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

**"기능 구현 상태"의 완료 항목은 한 줄 요약 + 커밋 해시로만 기록한다** (예: `- 기능명 (커밋 \`abc1234\`)`). "왜/어떻게" 같은 배경 설명, 구현 세부사항은 적지 않는다 — 필요하면 `git show <해시>`로 찾을 수 있다. 단, 실제 동작 규칙(다른 코드를 건드릴 때 알아야 할 제약)은 "핵심 도메인 규칙" 섹션에 별도로 남긴다. 이 규칙은 문서가 세션마다 계속 길어지는 것을 막기 위함이니 예외를 두지 않는다.
