-- Asset categories become admin-managed data instead of an enum.
-- The old enum values are seeded as rows and existing assets are re-pointed,
-- so no data is lost.

CREATE TABLE `asset_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NULL,
    `name_en` VARCHAR(100) NOT NULL,
    `name_am` VARCHAR(100) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_categories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The previous enum values, with the labels the app showed for them.
INSERT INTO `asset_categories` (`code`, `name_en`, `name_am`, `sort_order`, `updated_at`) VALUES
    ('FURNITURE', 'Furniture', 'የቤት ዕቃ', 1, NOW(3)),
    ('ELECTRONICS', 'Electronics', 'ኤሌክትሮኒክስ', 2, NOW(3)),
    ('MUSICAL_INSTRUMENT', 'Musical instrument', 'የዜማ መሣሪያ', 3, NOW(3)),
    ('LITURGICAL', 'Liturgical item', 'የአገልግሎት ንዋየ ቅድሳት', 4, NOW(3)),
    ('BOOKS', 'Books', 'መጻሕፍት', 5, NOW(3)),
    ('CLOTHING', 'Clothing & vestments', 'አልባሳት', 6, NOW(3)),
    ('VEHICLE', 'Vehicle', 'ተሽከርካሪ', 7, NOW(3)),
    ('OTHER', 'Other', 'ሌላ', 8, NOW(3));

-- Re-point existing assets at the new rows.
ALTER TABLE `assets` ADD COLUMN `category_id` INTEGER NULL;

UPDATE `assets` a
JOIN `asset_categories` c ON c.`code` = a.`category`
SET a.`category_id` = c.`id`;

ALTER TABLE `assets` MODIFY `category_id` INTEGER NOT NULL;

DROP INDEX `assets_category_idx` ON `assets`;

CREATE INDEX `assets_category_id_idx` ON `assets`(`category_id`);

ALTER TABLE `assets` ADD CONSTRAINT `assets_category_id_fkey`
    FOREIGN KEY (`category_id`) REFERENCES `asset_categories`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `assets` DROP COLUMN `category`;
