-- CreateTable
CREATE TABLE `assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `category` ENUM('FURNITURE', 'ELECTRONICS', 'MUSICAL_INSTRUMENT', 'LITURGICAL', 'BOOKS', 'CLOTHING', 'VEHICLE', 'OTHER') NOT NULL,
    `description` VARCHAR(1000) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `condition` ENUM('NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN') NOT NULL DEFAULT 'GOOD',
    `status` ENUM('IN_USE', 'IN_STORE', 'UNDER_REPAIR', 'LOST', 'DISPOSED') NOT NULL DEFAULT 'IN_USE',
    `location` VARCHAR(150) NULL,
    `serial_number` VARCHAR(100) NULL,
    `acquisition` ENUM('PURCHASED', 'DONATED') NULL,
    `acquired_on` DATE NULL,
    `cost` DECIMAL(12, 2) NULL,
    `donor_name` VARCHAR(150) NULL,
    `department_id` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `photo_path` VARCHAR(255) NULL,
    `created_by_id` INTEGER NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_asset_code_key`(`asset_code`),
    INDEX `assets_department_id_idx`(`department_id`),
    INDEX `assets_category_idx`(`category`),
    INDEX `assets_status_idx`(`status`),
    INDEX `assets_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

