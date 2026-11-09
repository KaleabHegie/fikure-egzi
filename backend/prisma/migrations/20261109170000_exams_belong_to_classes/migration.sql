-- Exams now belong to a class (optionally one level of it) instead of a
-- service department; the department that runs the class manages them.

-- AlterTable: the new columns, nullable while existing exams are filled in.
ALTER TABLE `exams`
    ADD COLUMN `class_grade_id` INTEGER NULL,
    ADD COLUMN `class_type_id` INTEGER NULL;

-- Data: an existing exam goes to the class its department runs (the first
-- such class), or failing that the first class.
UPDATE `exams` e
SET e.`class_type_id` = COALESCE(
  (SELECT t.`id` FROM `class_types` t WHERE t.`department_id` = e.`department_id`
   ORDER BY t.`sort_order`, t.`id` LIMIT 1),
  (SELECT t.`id` FROM `class_types` t ORDER BY t.`sort_order`, t.`id` LIMIT 1)
);

ALTER TABLE `exams` MODIFY `class_type_id` INTEGER NOT NULL;

-- DropForeignKey
ALTER TABLE `exams` DROP FOREIGN KEY `exams_department_id_fkey`;

-- DropIndex
DROP INDEX `exams_department_id_held_on_idx` ON `exams`;

-- AlterTable
ALTER TABLE `exams` DROP COLUMN `department_id`;

-- CreateIndex
CREATE INDEX `exams_class_type_id_held_on_idx` ON `exams`(`class_type_id`, `held_on`);

-- CreateIndex
CREATE INDEX `exams_class_grade_id_idx` ON `exams`(`class_grade_id`);

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `class_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_class_grade_id_fkey` FOREIGN KEY (`class_grade_id`) REFERENCES `class_grades`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
