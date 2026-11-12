-- SERVICE_GROUP sessions can cover more groups of the same grade (null = just the one group).
ALTER TABLE `attendance_sessions` ADD COLUMN `extra_service_group_ids` JSON NULL;
