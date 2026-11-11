-- The permission request form (ቅጽ 2): type, form number, request and decision details.
ALTER TABLE `late_permissions`
    ADD COLUMN `code` VARCHAR(20) NULL,
    ADD COLUMN `type` ENUM('LATE_ARRIVAL', 'SICK_LEAVE', 'MISS_STUDY', 'LEAVE_EARLY', 'CONSECUTIVE_DAYS', 'OTHER') NOT NULL DEFAULT 'LATE_ARRIVAL',
    ADD COLUMN `type_other` VARCHAR(150) NULL,
    ADD COLUMN `from_time` VARCHAR(5) NULL,
    ADD COLUMN `to_time` VARCHAR(5) NULL,
    ADD COLUMN `requested_on` DATE NULL,
    ADD COLUMN `contact_phone` VARCHAR(20) NULL,
    ADD COLUMN `member_confirmed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `member_confirmed_on` DATE NULL,
    -- Permissions given before the form existed were in force: they stay approved.
    ADD COLUMN `decision` ENUM('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO') NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN `decided_on` DATE NULL,
    ADD COLUMN `representative_name` VARCHAR(150) NULL,
    ADD COLUMN `head_name` VARCHAR(150) NULL,
    MODIFY `grace_minutes` INTEGER NULL;

UPDATE `late_permissions`
SET `code` = CONCAT('PRM-', LPAD(`id`, 5, '0')),
    `requested_on` = DATE(`created_at`),
    `decided_on` = DATE(`created_at`);

ALTER TABLE `late_permissions`
    MODIFY `code` VARCHAR(20) NOT NULL,
    MODIFY `requested_on` DATE NOT NULL,
    ALTER COLUMN `decision` SET DEFAULT 'PENDING';

CREATE UNIQUE INDEX `late_permissions_code_key` ON `late_permissions`(`code`);
