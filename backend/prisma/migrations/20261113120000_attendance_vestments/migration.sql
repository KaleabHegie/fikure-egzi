-- ልብሰ ስብሐት (vestments of praise): note who took one at a session and when it came back.
ALTER TABLE `attendance_records` ADD COLUMN `vestment_returned_at` DATETIME(3) NULL,
    ADD COLUMN `vestment_returned_by_id` INTEGER NULL,
    ADD COLUMN `vestment_taken_at` DATETIME(3) NULL,
    ADD COLUMN `vestment_taken_by_id` INTEGER NULL;

ALTER TABLE `attendance_sessions` ADD COLUMN `vestments` BOOLEAN NOT NULL DEFAULT false;

-- Data: existing service-group, "other" and Mezmur class sessions may hand out vestments.
UPDATE `attendance_sessions` s
LEFT JOIN `class_grades` g ON g.`id` = s.`class_grade_id`
LEFT JOIN `class_types` t ON t.`id` = g.`class_type_id`
SET s.`vestments` = true
WHERE s.`kind` IN ('SERVICE_GROUP', 'OTHER') OR (s.`kind` = 'CLASS' AND t.`code` = 'MEZMUR');
