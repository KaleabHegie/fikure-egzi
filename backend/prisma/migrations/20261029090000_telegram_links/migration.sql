-- CreateTable
CREATE TABLE `telegram_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `chat_id` BIGINT NOT NULL,
    `telegram_user_id` BIGINT NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `member_id` INTEGER NULL,
    `language` VARCHAR(2) NOT NULL DEFAULT 'am',
    `linked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `telegram_links_chat_id_key`(`chat_id`),
    INDEX `telegram_links_phone_idx`(`phone`),
    INDEX `telegram_links_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `telegram_links` ADD CONSTRAINT `telegram_links_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

