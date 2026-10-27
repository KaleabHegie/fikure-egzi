-- CreateTable
CREATE TABLE `class_placement_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `class_type_id` INTEGER NOT NULL,
    `class_grade_id` INTEGER NOT NULL,
    `started_at` DATE NOT NULL,
    `ended_at` DATE NULL,
    `recorded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `class_placement_history_member_id_class_type_id_ended_at_idx`(`member_id`, `class_type_id`, `ended_at`),
    INDEX `class_placement_history_class_grade_id_idx`(`class_grade_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department_service_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `department_id` INTEGER NOT NULL,
    `role` ENUM('HEAD', 'DEPUTY', 'SECRETARY', 'MEMBER') NOT NULL,
    `started_at` DATE NOT NULL,
    `ended_at` DATE NULL,
    `recorded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `department_service_history_member_id_department_id_ended_at_idx`(`member_id`, `department_id`, `ended_at`),
    INDEX `department_service_history_department_id_ended_at_idx`(`department_id`, `ended_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `class_placement_history` ADD CONSTRAINT `class_placement_history_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_placement_history` ADD CONSTRAINT `class_placement_history_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `class_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_placement_history` ADD CONSTRAINT `class_placement_history_class_grade_id_fkey` FOREIGN KEY (`class_grade_id`) REFERENCES `class_grades`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department_service_history` ADD CONSTRAINT `department_service_history_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department_service_history` ADD CONSTRAINT `department_service_history_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every current placement/membership becomes an open history period,
-- so history starts complete instead of empty.
INSERT INTO `class_placement_history` (`member_id`, `class_type_id`, `class_grade_id`, `started_at`, `recorded_by_id`)
SELECT `member_id`, `class_type_id`, `class_grade_id`, DATE(`assigned_at`), `assigned_by_id`
FROM `member_class_enrollments`;

INSERT INTO `department_service_history` (`member_id`, `department_id`, `role`, `started_at`, `recorded_by_id`)
SELECT `member_id`, `department_id`, `role`, `joined_at`, `created_by_id`
FROM `department_memberships`;
