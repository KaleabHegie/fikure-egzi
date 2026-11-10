-- AlterTable
ALTER TABLE `attendance_sessions` ADD COLUMN `absent_after_minutes` INTEGER NULL;

-- CreateTable
CREATE TABLE `late_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `department_id` INTEGER NOT NULL,
    `grace_minutes` INTEGER NOT NULL,
    `weekdays` JSON NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `evidence_path` VARCHAR(255) NULL,
    `evidence_name` VARCHAR(150) NULL,
    `evidence_type` VARCHAR(50) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `late_permissions_member_id_idx`(`member_id`),
    INDEX `late_permissions_department_id_ends_on_idx`(`department_id`, `ends_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `late_permissions` ADD CONSTRAINT `late_permissions_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `late_permissions` ADD CONSTRAINT `late_permissions_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

