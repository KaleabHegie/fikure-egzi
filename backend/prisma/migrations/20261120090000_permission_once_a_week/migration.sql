-- በሳምንት አንድ ቀን ብቻ መምጣት: a member who comes only one day a week.
ALTER TABLE `late_permissions` MODIFY `type` ENUM('LATE_ARRIVAL', 'SICK_LEAVE', 'MISS_STUDY', 'LEAVE_EARLY', 'CONSECUTIVE_DAYS', 'OTHER', 'ONCE_A_WEEK') NOT NULL DEFAULT 'LATE_ARRIVAL';
