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
                attendance(출근/퇴근/근태조회), workPlaces(근무지 CRUD), approval(전자결제)
  lib/          db, employeeId(사번 채번), leaveAccrual(연차 자동발생), leaveApproval(연차 승인/반려 —
                최종 결재 승인 시 approval.ts가 호출), approval(전자결제 문서 생성/승인/반려/취소),
                approvalLine(결재선 자동추천), permissions, attendance(Haversine 거리계산 + 출퇴근 비즈니스 로직),
                geocode(카카오 로컬 API로 주소 -> 좌표 변환, work_places 등록/수정 시 서버가 대행)
  middleware/   auth, permission
  db/schema.ts  Drizzle 스키마 (도메인 규칙이 주석으로 문서화되어 있음)
  drizzle/      마이그레이션 (0000~0009)

frontend/src/
  pages/        LoginPage, HomePage, MyProfilePage, EmployeesPage, DepartmentsPage,
                ReferenceDataPage(직급/직책), RolesPage, AdminPasswordResetsPage,
                LeaveManagementPage(본인 연차), ApprovalDraftsPage(기안함), ApprovalInboxPage(결재함),
                ApprovalAllDocumentsPage(전체 문서함 — 상무 이상만),
                AttendanceHistoryPage(근태내역조회 달력), AttendanceClockPage(출근/퇴근),
                WorkPlacesPage(근무지 관리), ComingSoonPage(미구현 메뉴 placeholder — 현재 대상 없음)
  layout/       AppShell, menuData
  auth/         AuthContext, RequireAuth, RequirePermission
  components/   EmployeeForm, Modal(wide 옵션으로 2단 레이아웃 모달 지원), ApprovalLinePicker(결재선 편집/미리보기),
                ApprovalStepsProgress(결재 진행현황 스텝 인디케이터), ApprovalDocumentDetailModal(문서 상세 공용 모달)
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
- **출근/퇴근 반경 검증은 직군(`employees.jobType`: `OFFICE`/`DELIVERY`/`SALES`)별로 "필수 여부"가 다르고, 필수가 아닌 경우에도 반경 결과로 자동 분류한다.** 사무직은 출근·퇴근 모두 `work_places` 반경(기본 100m) 안이 아니면 막힘(필수). 배송직은 출근만 필수, 퇴근은 막지 않음. 영업직은 출퇴근 모두 막지 않음. **"막지 않음"인 경우에도 실제로 반경 안이면 일반 출근/퇴근(`NORMAL`, 문구도 "출근/퇴근")으로, 밖이면 현장출근/현장퇴근(`FIELD`, 문구도 "현장출근/현장퇴근")으로 자동 기록된다** — 즉 반경 체크 자체는 항상 하되, 막을지 말지만 직군별로 다름. 이 규칙은 `backend/src/lib/attendance.ts`의 `requiresRadiusCheck()`+`checkIn`/`checkOut`과 프론트 `AttendanceClockPage.tsx`의 동일 이름 함수+`checkInLabel`/`checkOutLabel` 두 곳에 **의도적으로 중복 구현**되어 있음 — 프론트는 버튼 활성화/문구 UX용 1차 판단이고, 서버가 항상 좌표를 재검증하는 최종 판단이다. 이 규칙을 바꿀 때는 두 곳 다 수정해야 함.
- **`attendance_logs`는 체크인/체크아웃 정보를 한 행에 담는다** (출근 시 insert, 퇴근 시 같은 행을 update) — `leaveRequests`처럼 상태별로 별도 행을 만들지 않음. `checkInAt`/`checkOutAt`은 항상 서버 `new Date().toISOString()`으로 기록하고 클라이언트가 보낸 시간은 신뢰하지 않는다.
- **출근/퇴근 API는 멱등(idempotent)하게 동작한다.** 이미 `WORKING` 상태인데 다시 출근을 시도하면(네트워크 재시도 등) 에러 대신 기존 기록을 그대로 반환하고, 이미 `DONE`인데 다시 퇴근을 시도해도 마찬가지다. 동시 요청 레이스는 `attendance_logs_working_employee_idx`(부분 유니크 인덱스, `WHERE status='WORKING'`)로 DB 레벨에서도 막는다.
- **Geolocation은 컴포넌트가 `navigator.geolocation`을 직접 쓰지 않고 항상 `frontend/src/lib/geolocation.ts`의 `GeoProvider` 인터페이스(`webGeoProvider` 구현체)를 통해서만 접근한다.** 추후 Capacitor/React Native로 전환할 때 이 구현체만 교체하면 되도록 설계됨.
- **연차관리/근태관리 관련 권한 코드**: `LEAVE_MANAGE`, `ATTENDANCE_MANAGE`(근무지 CRUD + 타 직원 근태 조회) — 모두 `permissions.category = '근태관리'`. `LEAVE_APPROVE`는 전자결제 도입(아래 항목 참고)으로 더 이상 라우트에서 쓰이지 않음 — DB에는 남아있지만(`permissions`/`role_permissions` 행 삭제 안 함) 실사용처 없음.
- **전자결제(전자결재)**: `approval_documents`(문서 헤더)/`approval_steps`(결재 단계) 두 테이블로 구성. 문서 유형은 `GENERAL`(자유양식)과 `LEAVE`(연차 신청, 상세는 `leaveRequests.documentId`로 역참조)만 있음(1단계 범위). 결재선은 `backend/src/lib/approvalLine.ts`의 `recommendDefaultApprovalLine()`이 자동 추천한다 — **1차: 기안자와 같은 부서에서 본인 제외 직급 최고자, 2차(최종): 물류부(부서코드 `C`) 기안이면 전사의 '상무', 그 외 모든 부서는 전사의 '실장'로 고정**(부서 무관, 직급명 기준). 기안자 본인이 이미 부서 내 최고직급자면 1차 슬롯이 아예 생성되지 않는다 — 이때 `approval_steps.stepOrder`는 1로 당겨지지 않고 원래 슬롯 번호 2를 그대로 유지한다(문서마다 stepOrder가 1부터 연속일 필요 없음, "다음 단계"는 항상 `MIN(stepOrder) WHERE stepOrder > 현재`로 찾음). 승인/반려/취소 로직은 `backend/src/lib/approval.ts`. 결재선에 지정된 사람만 승인/반려 가능하며, **상무 이상 직급(`job_grades.sortOrder >= '상무'의 sortOrder`)은 결재선에 없어도 전체 문서함(`/approval/all`)에서 모든 문서를 열람 가능**(승인/반려 권한은 아님, `isExecutiveViewer()`). 연차 신청은 `POST /leave/requests`가 내부적으로 `createApprovalDocument(documentType:"LEAVE")`를 호출해 결재 문서로 생성되며, 최종 승인 시에만 `leaveApproval.ts`의 `buildLeaveApprovalUpdates()`로 잔액이 차감된다(문서/단계 갱신과 한 `db.batch()`로 원자 처리). **알려진 제약**: 연차 신청 화면에는 결재선 편집 UI가 없어서, 추천 결재선이 완전히 비면(전사 최고직급자 본인이 신청) 신청 자체가 막힌다.
- **`work_places` 등록/수정은 위도/경도를 직접 입력받지 않고 주소(`address`)만 입력받아 서버가 카카오 로컬 API로 지오코딩한다** (`backend/src/lib/geocode.ts`). API 키(`KAKAO_REST_API_KEY`)는 백엔드 시크릿으로만 보관하고 프론트에는 절대 노출하지 않음 — 그래서 지오코딩 호출은 항상 `POST/PATCH /work-places`에서 서버가 대행. 로컬 개발 시 `backend/.dev.vars`(gitignore됨, `.dev.vars.example` 참고)에 키를 넣어야 동작함. 카카오 디벨로퍼스 앱에서 "카카오맵" 제품이 활성화돼 있어야 API가 응답함(비활성 시 403 `OPEN_MAP_AND_LOCAL service disabled`).
- **비밀번호 재설정은 관리자 승인 없이 카카오 계정 연동(OAuth)만으로 본인이 직접 한다.** `employees.kakaoUserId`(unique)에 미리 연동해둔 카카오 고유 ID가 있어야 하며, 없는 계정은 `mustChangePassword`와 동일한 패턴으로 로그인 직후 `/link-kakao`로 강제 이동된다(프론트 `RequireAuth.tsx`). 재설정 흐름: `GET /auth/kakao/authorize-url`(비로그인 가능) → 카카오 인증 → `POST /auth/kakao/reset-verify`(인가코드로 카카오 ID 확인 후 `password_reset_tokens`에 10분 만료 1회용 토큰 발급) → `POST /auth/kakao/reset-complete`(토큰+새 비밀번호). 카카오 로그인 Client ID는 지오코딩과 같은 카카오 앱의 `KAKAO_REST_API_KEY`를 재사용하고 Client Secret만 별도 시크릿(`KAKAO_LOGIN_CLIENT_SECRET`)으로 관리 — 전화번호/이메일 같은 민감 동의항목을 요청하지 않아 카카오 측 비즈니스 심사가 필요 없다(`backend/src/lib/kakaoOAuth.ts`). 예전 관리자 승인 이력 테이블(`password_reset_requests`)은 삭제하지 않고 그대로 남아있지만 더 이상 새로 쓰이지 않음. `generateTempPassword()`(고정값 `qwer1234!`)는 신규 직원 등록 시에만 쓰이고 재설정에는 더 이상 쓰이지 않는다.

## 기능 구현 상태

**완료됨** (오래된 순, 상세 내역은 `git log`/`git show <해시>` 참고):
- 로그인/인증/세션 관리
- 홈 화면 UI (아이콘 레일 + 서브메뉴)
- 인사관리: 직원/부서/직급·직책/역할/권한 CRUD + 드래그 재정렬
- 비밀번호 재설정 승인 플로우 (관리자 승인 방식 — **이후 카카오 연동 셀프 재설정으로 대체됨, 아래 참고**)
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
- **비밀번호 재설정을 관리자 승인 방식에서 카카오 계정 연동 셀프 재설정으로 전환** (커밋 `0aaacd1`) — 관리자 승인 플로우(`AdminPasswordResetsPage`, `EMPLOYEE_APPROVE` 권한, `/password-reset-requests*`) 완전 제거. 상세 동작은 위 "핵심 도메인 규칙" 참고. 운영/테스트 양쪽 마이그레이션+배포 완료, 로컬에서 실제 카카오 로그인 화면 도달까지 검증함(계정 소유 확인 자체는 사용자 본인 카카오 계정이 필요해 대신 완주 불가).
- **카카오 연동 강제를 환경변수로 끌 수 있게 변경** (커밋 `ed35eb6`) — `frontend/.env.test`에 `VITE_REQUIRE_KAKAO_LINK=false` 지정, 테스트 환경은 로그인 후 `/link-kakao` 강제 없이 바로 이용 가능(값 없으면 운영처럼 기본 강제). 운영 Z0001(테스트/관리자 계정, 실제 연락처 없음)은 실제 카카오 인증 없이 `kakao_user_id`를 임의 문자열(`SEED_EXEMPT_Z0001`, 카카오 숫자 ID와 절대 안 겹침)로 직접 DB에 채워 강제 화면을 건너뛰게 처리 완료.
- **[운영 장애 수정] 비밀번호 변경 강제 + 카카오 연동 강제 동시 필요 계정의 무한 리다이렉트 버그** (커밋 `9230e37`) — `mustChangePassword=true`이면서 `kakaoUserId`가 없는 계정(임시 비밀번호를 아직 안 바꾼, 카카오도 아직 연동 안 한 일반적인 신규/기존 직원 상태)이 로그인하면 `/change-password`↔`/link-kakao`를 무한 반복하며 빈 화면으로 멈추는 실제 운영 장애였음(A0003 계정에서 사용자가 직접 발견). `RequireAuth.tsx`의 카카오 연동 강제 조건에 `!mustChangePassword`를 추가해서 비밀번호를 먼저 바꾸기 전에는 카카오 체크 자체가 발동하지 않도록 수정. **운영에서 실제 재현 후 수정 확인까지 완료.** 이 버그는 카카오 연동 기능이 배포된 시점(`0aaacd1`)부터 존재했으므로, 그 사이 로그인을 시도했다가 막힌 직원이 있을 수 있음 — 문의 오면 이 버그였다고 안내.
- **카카오 로그인 실전 검증 완료 + 에러 로깅 보강** (커밋 `00156aa`) — 사용자가 실제 카카오 계정으로 연동→로그아웃 상태에서 셀프 비밀번호 재설정까지 운영에서 전 과정 완주함(A0003 계정). 이 과정에서 KOE006(Redirect URI가 "카카오 로그인" 섹션이 아니라 "로그아웃 리다이렉트 URI"에 잘못 등록됨), KOE010(`KAKAO_LOGIN_CLIENT_SECRET` 값이 카카오 콘솔의 실제 활성 값과 불일치) 두 가지 설정 오류를 발견해 사용자가 직접 수정함. 앞으로 같은 문제 재발 시 원인을 바로 알 수 있도록 카카오 토큰 교환 실패 시 응답 본문을 서버 로그에 남기도록 `backend/src/lib/kakaoOAuth.ts`/`backend/src/routes/auth.ts`에 에러 로깅 추가(실제 시크릿 값은 로그에 남기지 않음). 운영/테스트 배포 완료.
- **모달이 드래그로 의도치 않게 닫히던 버그 수정** (커밋 `c15bb03`) — 입력창 안에서 텍스트를 드래그 선택하다 모달 바깥까지 끌고 나가서 놓으면 브라우저가 그 mouseup을 오버레이 클릭으로 처리해 모달이 닫히던 문제. `frontend/src/components/Modal.tsx`가 mousedown이 오버레이 배경 자체에서 시작된 경우에만 클릭으로 간주해 닫도록 수정 — 공용 컴포넌트라 앱 전체 모달(직원 수정, 연차 신청 등)에 동일하게 적용됨. 운영/테스트 배포 완료.
- **근무지 관리 라벨 정리** (커밋 `bf8bc61`) — "지점명"을 "근무지"로 변경(폼+목록 헤더), 반경(m) 입력창의 하드코딩된 기본값 "100"을 제거해 빈 값으로 시작하도록 수정.
- **전자결제(전자결재) 시스템 도입** (커밋 `c3ec5a5`, `52669b6`) — 기안/결재선 자동추천/승인·반려·취소 흐름 신설, 연차 신청을 결재 문서로 흡수, 기존 관리자 승인 화면(`AdminLeaveRequestsPage`, `LEAVE_APPROVE` 권한 라우트) 제거. 상세 규칙은 위 "핵심 도메인 규칙"의 "전자결제(전자결재)" 항목 참고. 로컬에서 직급 서열 5가지 시나리오 + 승인/반려/취소/연차잔액차감 전체 흐름 검증, 운영/테스트 양쪽 마이그레이션+배포 완료.
- **직원관리 개인정보 보호 강화** (커밋 `e7d14e6`) — 정규직/계약직·배송직 지입여부 필드 추가, 전화번호 포맷에 서울(02) 지역번호 구분 추가, `EMPLOYEE_WRITE` 없는 조회자에게 이름/부서/직급/직군/내선번호 제외 필드 마스킹 + 본인 설정 PIN으로 잠금해제(`상세보기` 화면, `MyProfilePage`에서 PIN 설정), 이름/입사일 서버+프론트 양쪽 수정불가 처리, 등록/수정 폼 제출 버튼 로딩상태+중복제출 방지. 운영/테스트 양쪽 마이그레이션(`0011_red_blue_blade.sql`)+배포 완료, 테스트 환경에서 브라우저로 전 항목(고용형태 저장, 지입여부 DELIVERY 한정 노출, 3가지 전화번호 포맷, 마스킹→PIN 잠금해제 전체 흐름) 검증 완료. 사진 업로드(주민등록등본/보건증, "자료실") 항목은 사용자가 이번 범위에서 명시적으로 제외, 별도 요청 시 진행.

**미구현**: 없음 (`App.tsx`/`menuData.ts`의 `ComingSoonPage` 대상 메뉴가 현재 모두 실제 화면으로 연결됨). 향후 새 메뉴가 추가되면 다시 이 자리에 기록.

## 현재 작업 진행 상황 (수동 갱신 섹션)

> 기준: 2026-08-15. 전자결제(전자결재) 시스템 1단계 구현 완료(커밋 `c3ec5a5`, `52669b6`) — 운영/테스트 양쪽 마이그레이션+배포 완료. **이 2개 커밋은 아직 `origin/main`에 push하지 않음** (`git status`에 "ahead 2"로 표시됨, push는 요청받지 않아 로컬에만 있음).
>
> **미커밋 상태로 남아있는 작업**: 기안 작성 모달(`ApprovalDraftsPage.tsx`)에 결재선 미리보기 2단 레이아웃이 빠져있던 것과, 공용 `Modal`이 480px로 폭이 고정돼 2단 레이아웃이 찌그러지던 문제를 수정함(`Modal.tsx`에 `wide` 옵션 추가, `LeaveManagementPage.tsx`/`ApprovalDraftsPage.tsx`가 사용, `index.css`에 `.modal-card--wide` 추가). **이미 로컬 검증 후 테스트/운영 양쪽에 배포까지 완료했지만 git 커밋은 아직 안 함** — 다음 세션에서 커밋 필요.
>
> **참고(내 작업 아님, 손대지 않음)**: 이 세션 도중 다른 세션이 동시에 이 폴더에서 "조직도"(`OrgChartPage.tsx`, `/org-chart` 라우트+메뉴) 기능을 작업 중이었음. 그 변경분은 `App.tsx`/`menuData.ts`/`index.css`에 미커밋 상태로 섞여 있고(`OrgChartPage.tsx`는 untracked), 의도적으로 되돌리지 않고 그대로 둠 — 내 커밋들에는 포함시키지 않았고 운영/테스트 배포에도 반영 안 됨. 다음 세션에서 `git status`를 보면 이 미커밋 변경이 남아있는 게 정상이니 당황하지 말 것(그 세션이 아직 커밋 안 한 것뿐).
>
> **미완료 항목(전자결제와 별개, 여전히 미해결)**: `KAKAO_REST_API_KEY` 테스트 환경 시크릿이 아직 미등록 — `wrangler secret put KAKAO_REST_API_KEY --env test`. 이게 없으면 테스트 환경에서는 근무지 지오코딩뿐 아니라 카카오 로그인(연동/재설정)도 `client_id=undefined`로 실패한다(운영은 이미 등록되어 있어 정상 동작 확인함. 다만 테스트 환경은 `VITE_REQUIRE_KAKAO_LINK=false`라 카카오 연동 자체가 강제되진 않음).

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
