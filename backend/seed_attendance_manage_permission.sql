INSERT INTO permissions (code, name, category)
SELECT 'ATTENDANCE_MANAGE', '근무지 관리 및 전 직원 근태 조회', '근태관리'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'ATTENDANCE_MANAGE');

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = '시스템관리자'), (SELECT id FROM permissions WHERE code = 'ATTENDANCE_MANAGE')
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions
  WHERE role_id = (SELECT id FROM roles WHERE name = '시스템관리자')
    AND permission_id = (SELECT id FROM permissions WHERE code = 'ATTENDANCE_MANAGE')
);
