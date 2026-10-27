-- Photos are now uploaded files served through the API, not external URLs.
-- Rename (not drop+add) so no existing value is lost.
ALTER TABLE `members` RENAME COLUMN `photo_url` TO `photo_path`;
