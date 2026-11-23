INSERT INTO "role" (code, name, data_scope)
SELECT 'superadmin', 'Superadministrator', data_scope FROM "role" WHERE code = 'admin';

INSERT INTO permission (code, name)
VALUES ('REGISTRATION_REVIEW', 'Review registration requests');

INSERT INTO role_permission (role_id, permission_id)
SELECT owner.role_id, grant_row.permission_id
FROM "role" owner
CROSS JOIN "role" admin
JOIN role_permission grant_row ON grant_row.role_id = admin.role_id
WHERE owner.code = 'superadmin' AND admin.code = 'admin'
UNION
SELECT owner.role_id, permission.permission_id
FROM "role" owner CROSS JOIN permission
WHERE owner.code = 'superadmin' AND permission.code = 'REGISTRATION_REVIEW';
