-- CreateTable
CREATE TABLE `departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `name_en` VARCHAR(120) NOT NULL,
    `name_am` VARCHAR(120) NOT NULL,
    `description_en` VARCHAR(500) NULL,
    `description_am` VARCHAR(500) NULL,
    `parent_id` INTEGER NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_code_key`(`code`),
    INDEX `departments_parent_id_sort_order_idx`(`parent_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department_memberships` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `department_id` INTEGER NOT NULL,
    `member_id` INTEGER NOT NULL,
    `role` ENUM('HEAD', 'DEPUTY', 'SECRETARY', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `joined_at` DATE NOT NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `department_memberships_member_id_idx`(`member_id`),
    INDEX `department_memberships_department_id_role_idx`(`department_id`, `role`),
    UNIQUE INDEX `department_memberships_department_id_member_id_key`(`department_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department_memberships` ADD CONSTRAINT `department_memberships_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department_memberships` ADD CONSTRAINT `department_memberships_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
