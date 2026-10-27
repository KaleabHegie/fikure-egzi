-- AlterTable
ALTER TABLE `attendance_sessions` ADD COLUMN `auto_close` BOOLEAN NOT NULL DEFAULT true;


-- Existing sessions were run by hand; don't close them retroactively.
UPDATE `attendance_sessions` SET `auto_close` = false;
