-- Data: a System administrator role above the Office administrator (SUPER_ADMIN).
-- Every account that is an office administrator today becomes a system
-- administrator, so nobody loses access; office staff can be moved back to
-- Office administrator afterwards. The seed then sets both roles' permissions.

INSERT INTO `roles` (`code`, `name`, `description`, `is_system`, `department_scoped`, `created_at`, `updated_at`)
SELECT 'SYSTEM_ADMIN', 'System administrator',
  'Full control of the system: every module and department, all user accounts and roles, settings and the audit log',
  true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `roles` WHERE `code` = 'SYSTEM_ADMIN');

-- Until the seed runs (moments later), the new role carries the office role's grants.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT sa.`id`, rp.`permission_id`
FROM `roles` sa
JOIN `roles` oa ON oa.`code` = 'SUPER_ADMIN'
JOIN `role_permissions` rp ON rp.`role_id` = oa.`id`
WHERE sa.`code` = 'SYSTEM_ADMIN';

UPDATE `user_roles` ur
JOIN `roles` oa ON oa.`id` = ur.`role_id` AND oa.`code` = 'SUPER_ADMIN'
JOIN `roles` sa ON sa.`code` = 'SYSTEM_ADMIN'
SET ur.`role_id` = sa.`id`;
