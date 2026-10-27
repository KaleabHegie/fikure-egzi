-- Member status is Active or Inactive only: transferred and deceased members become Inactive.
UPDATE `members` SET `status` = 'INACTIVE' WHERE `status` IN ('TRANSFERRED', 'DECEASED');

-- AlterTable
ALTER TABLE `members` MODIFY `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE';

