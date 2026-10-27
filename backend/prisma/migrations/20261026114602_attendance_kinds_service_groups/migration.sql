-- Attendance has three kinds now: CLASS, SERVICE_GROUP and OTHER.
-- Existing gatherings, department meetings and events become OTHER (their
-- audience columns are kept, so their rosters are unchanged).
ALTER TABLE `attendance_sessions`
    MODIFY `kind` ENUM('CLASS', 'GATHERING', 'DEPARTMENT', 'EVENT', 'SERVICE_GROUP', 'OTHER') NOT NULL;
UPDATE `attendance_sessions` SET `kind` = 'OTHER' WHERE `kind` IN ('GATHERING', 'DEPARTMENT', 'EVENT');

-- AlterTable
ALTER TABLE `attendance_sessions` ADD COLUMN `service_group_id` INTEGER NULL,
    MODIFY `kind` ENUM('CLASS', 'SERVICE_GROUP', 'OTHER') NOT NULL;
-- CreateTable
CREATE TABLE `service_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name_en` VARCHAR(100) NOT NULL,
    `name_am` VARCHAR(100) NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NOT NULL,
    `is_current` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `service_terms_is_current_idx`(`is_current`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `term_id` INTEGER NOT NULL,
    `name_en` VARCHAR(100) NOT NULL,
    `name_am` VARCHAR(100) NOT NULL,
    `class_grade_id` INTEGER NULL,
    `notes` VARCHAR(500) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `service_groups_term_id_sort_order_idx`(`term_id`, `sort_order`),
    INDEX `service_groups_class_grade_id_idx`(`class_grade_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_group_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `term_id` INTEGER NOT NULL,
    `group_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assigned_by_id` INTEGER NULL,

    INDEX `service_group_members_group_id_idx`(`group_id`),
    INDEX `service_group_members_member_id_idx`(`member_id`),
    UNIQUE INDEX `service_group_members_term_id_member_id_key`(`term_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `attendance_sessions_service_group_id_idx` ON `attendance_sessions`(`service_group_id`);

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_service_group_id_fkey` FOREIGN KEY (`service_group_id`) REFERENCES `service_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_groups` ADD CONSTRAINT `service_groups_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `service_terms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_groups` ADD CONSTRAINT `service_groups_class_grade_id_fkey` FOREIGN KEY (`class_grade_id`) REFERENCES `class_grades`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_group_members` ADD CONSTRAINT `service_group_members_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `service_terms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_group_members` ADD CONSTRAINT `service_group_members_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `service_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_group_members` ADD CONSTRAINT `service_group_members_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

