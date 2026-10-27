-- The age section (children / youth / adult) is removed everywhere; it was derived from date of birth, so nothing is lost.
-- DropIndex
DROP INDEX `members_status_category_idx` ON `members`;

-- AlterTable
ALTER TABLE `attendance_sessions` DROP COLUMN `category`;

-- AlterTable
ALTER TABLE `members` DROP COLUMN `category`;

-- CreateIndex
CREATE INDEX `members_status_idx` ON `members`(`status`);

