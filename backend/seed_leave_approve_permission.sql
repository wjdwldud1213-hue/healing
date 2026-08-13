INSERT INTO permissions (code, name, category)
SELECT 'LEAVE_APPROVE', '연차 승인/반려', '근태관리'
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'LEAVE_APPROVE');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, (SELECT id FROM permissions WHERE code = 'LEAVE_APPROVE')
FROM roles r
WHERE r.name IN ('시스템관리자', '부서관리자')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = (SELECT id FROM permissions WHERE code = 'LEAVE_APPROVE')
  );
