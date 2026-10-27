-- CreateTable
CREATE TABLE `attendance_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` ENUM('CLASS', 'GATHERING', 'DEPARTMENT', 'EVENT') NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `late_after_minutes` INTEGER NOT NULL DEFAULT 15,
    `class_grade_id` INTEGER NULL,
    `department_id` INTEGER NULL,
    `category` ENUM('CHILDREN', 'YOUTH', 'ADULT') NULL,
    `location` VARCHAR(150) NULL,
    `notes` TEXT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `closed_at` DATETIME(3) NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_sessions_starts_at_idx`(`starts_at`),
    INDEX `attendance_sessions_kind_starts_at_idx`(`kind`, `starts_at`),
    INDEX `attendance_sessions_class_grade_id_idx`(`class_grade_id`),
    INDEX `attendance_sessions_department_id_idx`(`department_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `status` ENUM('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') NOT NULL,
    `checked_in_at` DATETIME(3) NULL,
    `method` ENUM('QR', 'MANUAL') NOT NULL,
    `note` VARCHAR(255) NULL,
    `in_roster` BOOLEAN NOT NULL DEFAULT true,
    `recorded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_records_member_id_status_idx`(`member_id`, `status`),
    UNIQUE INDEX `attendance_records_session_id_member_id_key`(`session_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_class_grade_id_fkey` FOREIGN KEY (`class_grade_id`) REFERENCES `class_grades`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
