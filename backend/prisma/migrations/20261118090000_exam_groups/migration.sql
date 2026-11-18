-- Candidates examined together and given the same marks at once.
CREATE TABLE `exam_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exam_id` INTEGER NOT NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exam_groups_exam_id_idx`(`exam_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `exam_candidates` ADD COLUMN `group_id` INTEGER NULL;

CREATE INDEX `exam_candidates_group_id_idx` ON `exam_candidates`(`group_id`);

ALTER TABLE `exam_groups` ADD CONSTRAINT `exam_groups_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `exam_candidates` ADD CONSTRAINT `exam_candidates_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `exam_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
