-- AlterTable
ALTER TABLE `attendance_sessions` ADD COLUMN `organiser_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `class_types` ADD COLUMN `department_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `roles` ADD COLUMN `department_scoped` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `user_departments` (
    `user_id` INTEGER NOT NULL,
    `department_id` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_departments_department_id_idx`(`department_id`),
    PRIMARY KEY (`user_id`, `department_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `attendance_sessions_organiser_id_idx` ON `attendance_sessions`(`organiser_id`);

-- CreateIndex
CREATE INDEX `class_types_department_id_idx` ON `class_types`(`department_id`);

-- AddForeignKey
ALTER TABLE `user_departments` ADD CONSTRAINT `user_departments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_departments` ADD CONSTRAINT `user_departments_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_types` ADD CONSTRAINT `class_types_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_organiser_id_fkey` FOREIGN KEY (`organiser_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Default class owners: Mezmur classes → the Mezmur department, Course classes → Education.
UPDATE `class_types` ct
  JOIN `departments` d ON d.`code` = CASE ct.`code` WHEN 'MEZMUR' THEN 'MEZMUR' WHEN 'COURSE' THEN 'EDUCATION' END
  SET ct.`department_id` = d.`id`
  WHERE ct.`department_id` IS NULL;

-- OTHER sessions that targeted a department are organised by it.
UPDATE `attendance_sessions` SET `organiser_id` = `department_id` WHERE `kind` = 'OTHER' AND `department_id` IS NOT NULL;
