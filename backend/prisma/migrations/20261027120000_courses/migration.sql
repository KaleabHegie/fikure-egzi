-- AlterTable
ALTER TABLE `users` ADD COLUMN `member_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `courses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `course_code` VARCHAR(20) NOT NULL,
    `name_en` VARCHAR(150) NOT NULL,
    `name_am` VARCHAR(150) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `duration` ENUM('THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR') NOT NULL,
    `pass_mark` INTEGER NOT NULL DEFAULT 50,
    `department_id` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by_id` INTEGER NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `courses_course_code_key`(`course_code`),
    INDEX `courses_department_id_idx`(`department_id`),
    INDEX `courses_name_am_idx`(`name_am`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_offerings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `course_id` INTEGER NOT NULL,
    `class_grade_id` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `notes` VARCHAR(1000) NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `course_offerings_course_id_start_date_idx`(`course_id`, `start_date`),
    INDEX `course_offerings_class_grade_id_idx`(`class_grade_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_teachers` (
    `offering_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `course_teachers_user_id_idx`(`user_id`),
    PRIMARY KEY (`offering_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_assessments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `offering_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `max_score` DECIMAL(5, 2) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `course_assessments_offering_id_sort_order_idx`(`offering_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_scores` (
    `assessment_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `score` DECIMAL(5, 2) NOT NULL,
    `updated_by_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `course_scores_member_id_idx`(`member_id`),
    PRIMARY KEY (`assessment_id`, `member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_member_id_key` ON `users`(`member_id`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_offerings` ADD CONSTRAINT `course_offerings_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_offerings` ADD CONSTRAINT `course_offerings_class_grade_id_fkey` FOREIGN KEY (`class_grade_id`) REFERENCES `class_grades`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_teachers` ADD CONSTRAINT `course_teachers_offering_id_fkey` FOREIGN KEY (`offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_teachers` ADD CONSTRAINT `course_teachers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_assessments` ADD CONSTRAINT `course_assessments_offering_id_fkey` FOREIGN KEY (`offering_id`) REFERENCES `course_offerings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_scores` ADD CONSTRAINT `course_scores_assessment_id_fkey` FOREIGN KEY (`assessment_id`) REFERENCES `course_assessments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_scores` ADD CONSTRAINT `course_scores_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

