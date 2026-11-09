-- AlterTable
ALTER TABLE `members` ADD COLUMN `agreement_accepted_at` DATETIME(3) NULL,
    ADD COLUMN `has_health_condition` BOOLEAN NULL,
    ADD COLUMN `health_condition_note` TEXT NULL,
    ADD COLUMN `self_registered` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `telegram_registrations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `chat_id` BIGINT NOT NULL,
    `telegram_user_id` BIGINT NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `language` VARCHAR(2) NOT NULL DEFAULT 'am',
    `step` VARCHAR(30) NOT NULL,
    `answers` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `telegram_registrations_chat_id_key`(`chat_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `key` VARCHAR(64) NOT NULL,
    `value` JSON NOT NULL,
    `updated_by_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `members_self_registered_idx` ON `members`(`self_registered`);
