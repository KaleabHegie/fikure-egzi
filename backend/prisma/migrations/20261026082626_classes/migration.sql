-- CreateTable
CREATE TABLE `class_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `name_en` VARCHAR(100) NOT NULL,
    `name_am` VARCHAR(100) NOT NULL,
    `description_en` VARCHAR(255) NULL,
    `description_am` VARCHAR(255) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `class_types_code_key`(`code`),
    INDEX `class_types_is_active_sort_order_idx`(`is_active`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_grades` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_type_id` INTEGER NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name_en` VARCHAR(100) NOT NULL,
    `name_am` VARCHAR(100) NOT NULL,
    `short_label` VARCHAR(10) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `class_grades_class_type_id_sort_order_idx`(`class_type_id`, `sort_order`),
    UNIQUE INDEX `class_grades_class_type_id_code_key`(`class_type_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_class_enrollments` (
    `member_id` INTEGER NOT NULL,
    `class_type_id` INTEGER NOT NULL,
    `class_grade_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assigned_by_id` INTEGER NULL,

    INDEX `member_class_enrollments_class_grade_id_idx`(`class_grade_id`),
    INDEX `member_class_enrollments_class_type_id_idx`(`class_type_id`),
    PRIMARY KEY (`member_id`, `class_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `class_grades` ADD CONSTRAINT `class_grades_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `class_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_class_enrollments` ADD CONSTRAINT `member_class_enrollments_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_class_enrollments` ADD CONSTRAINT `member_class_enrollments_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `class_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_class_enrollments` ADD CONSTRAINT `member_class_enrollments_class_grade_id_fkey` FOREIGN KEY (`class_grade_id`) REFERENCES `class_grades`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
