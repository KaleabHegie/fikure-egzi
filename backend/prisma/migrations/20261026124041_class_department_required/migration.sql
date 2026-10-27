-- Every class belongs to a department. Classes without one go to the office (ፅህፈት ቤት) first.
UPDATE `class_types` SET `department_id` = (SELECT `id` FROM `departments` WHERE `code` = 'OFFICE') WHERE `department_id` IS NULL;

-- DropForeignKey
ALTER TABLE `class_types` DROP FOREIGN KEY `class_types_department_id_fkey`;

-- AlterTable
ALTER TABLE `class_types` MODIFY `department_id` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `class_types` ADD CONSTRAINT `class_types_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

