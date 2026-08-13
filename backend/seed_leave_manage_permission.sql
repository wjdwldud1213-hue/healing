INSERT INTO permissions (code, name, category)
SELECT 'LEAVE_MANAGE', '연차 자동발생 배치 실행', '근태관리'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'LEAVE_MANAGE');

INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = '시스템관리자'), (SELECT id FROM permissions WHERE code = 'LEAVE_MANAGE')
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions
  WHERE role_id = (SELECT id FROM roles WHERE name = '시스템관리자')
    AND permission_id = (SELECT id FROM permissions WHERE code = 'LEAVE_MANAGE')
);
