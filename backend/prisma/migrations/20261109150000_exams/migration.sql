-- CreateTable
CREATE TABLE `exams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `department_id` INTEGER NOT NULL,
    `name_am` VARCHAR(150) NOT NULL,
    `name_en` VARCHAR(150) NULL,
    `description` VARCHAR(1000) NULL,
    `held_on` DATE NULL,
    `pass_mark` INTEGER NOT NULL DEFAULT 50,
    `created_by_id` INTEGER NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exams_department_id_held_on_idx`(`department_id`, `held_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_parts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exam_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `weight` DECIMAL(5, 2) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exam_parts_exam_id_sort_order_idx`(`exam_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_candidates` (
    `exam_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `added_by_id` INTEGER NULL,
    `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_candidates_member_id_idx`(`member_id`),
    PRIMARY KEY (`exam_id`, `member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_marks` (
    `part_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `score` DECIMAL(5, 2) NOT NULL,
    `updated_by_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exam_marks_member_id_idx`(`member_id`),
    PRIMARY KEY (`part_id`, `member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_parts` ADD CONSTRAINT `exam_parts_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_candidates` ADD CONSTRAINT `exam_candidates_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_candidates` ADD CONSTRAINT `exam_candidates_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_marks` ADD CONSTRAINT `exam_marks_part_id_fkey` FOREIGN KEY (`part_id`) REFERENCES `exam_parts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_marks` ADD CONSTRAINT `exam_marks_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

