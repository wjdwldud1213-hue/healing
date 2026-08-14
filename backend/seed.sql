-- 초기 데이터: 기본 부서/직급, 기본 역할 3개 + 권한 항목 + 역할별 매핑, 테스트용 시스템관리자 계정 1개
-- 실행: npm run db:seed:local (내부적으로 wrangler d1 execute --local --file=./seed.sql)

-- 부서 (시스템관리자 소속용)
INSERT INTO departments (code, name) VALUES ('Z', '시스템관리부');
INSERT INTO department_code_sequences (department_code, last_seq) VALUES ('Z', 1);

-- 직급
INSERT INTO job_grades (name, sort_order) VALUES ('관리자', 99);

-- 역할 (기본 3개 — 이후 관리자가 화면에서 추가/수정 가능)
INSERT INTO roles (name, description) VALUES ('일반직원', '본인 정보 조회/수정');
INSERT INTO roles (name, description) VALUES ('부서관리자', '소속 부서 직원 정보 조회, 승인 권한');
INSERT INTO roles (name, description) VALUES ('시스템관리자', '전체 직원 등록/수정/퇴사처리, 부서코드 관리, 역할/권한 관리');

-- 권한 항목 (메뉴/기능 단위)
INSERT INTO permissions (code, name, category) VALUES ('EMPLOYEE_READ_ALL', '전체 직원 조회', '인사관리');
INSERT INTO permissions (code, name, category) VALUES ('EMPLOYEE_READ_DEPARTMENT', '소속 부서 직원 조회', '인사관리');
INSERT INTO permissions (code, name, category) VALUES ('EMPLOYEE_WRITE', '직원 등록/수정/퇴사처리', '인사관리');
INSERT INTO permissions (code, name, category) VALUES ('DEPARTMENT_MANAGE', '부서코드 관리', '기준정보');
INSERT INTO permissions (code, name, category) VALUES ('JOB_CODE_MANAGE', '직급/직책 관리', '기준정보');
INSERT INTO permissions (code, name, category) VALUES ('ROLE_MANAGE', '역할/권한 관리', '시스템관리');

-- 역할별 권한 매핑
INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE name = '부서관리자'), id
  FROM permissions WHERE code IN ('EMPLOYEE_READ_DEPARTMENT');

INSERT INTO role_permissions (role_id, permission_id)
  SELECT (SELECT id FROM roles WHERE name = '시스템관리자'), id
  FROM permissions
  WHERE code IN (
    'EMPLOYEE_READ_ALL', 'EMPLOYEE_WRITE',
    'DEPARTMENT_MANAGE', 'JOB_CODE_MANAGE', 'ROLE_MANAGE'
  );

-- 테스트용 시스템관리자 계정 (사번 Z0001)
-- 임시 비밀번호: qwer1234!  (신규/재설정 임시 비밀번호 고정값과 동일, 최초 로그인 시 변경이 강제됩니다)
INSERT INTO employees (
  employee_id, name, department_id, job_grade_id, hire_date,
  mobile_phone, password_hash, must_change_password, role_id
) VALUES (
  'Z0001',
  '시스템관리자',
  (SELECT id FROM departments WHERE code = 'Z'),
  (SELECT id FROM job_grades WHERE name = '관리자'),
  date('now'),
  '010-0000-0000',
  '$2b$10$dcYLx.1lfoeJefGQlW4ulOfoQWcxfPJa1QodEzuYrTjih/vXcltmm',
  1,
  (SELECT id FROM roles WHERE name = '시스템관리자')
);

INSERT INTO employee_assignment_history (employee_id, department_id, job_grade_id, effective_date, reason)
VALUES (
  'Z0001',
  (SELECT id FROM departments WHERE code = 'Z'),
  (SELECT id FROM job_grades WHERE name = '관리자'),
  date('now'),
  '최초 등록 (시드 데이터)'
);
