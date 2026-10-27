-- The Sunday school's own structure chart. Existing departments are renamed in place, so the
-- people serving in them, class links, user assignments and history all carry over; the three
-- that don't exist in the chart become its three new departments.
UPDATE `departments` SET `sort_order` = 1 WHERE `code` = 'EDUCATION';

UPDATE `departments`
  SET `name_en` = 'Member Affairs & Programs', `name_am` = 'አባላት ጉዳይ እና መርሐ ግብር ክፍል', `sort_order` = 2
  WHERE `code` = 'MEMBER_AFFAIRS';

UPDATE `departments` SET `sort_order` = 3 WHERE `code` = 'MEZMUR';

UPDATE `departments`
  SET `name_en` = 'Arts', `name_am` = 'ሥነ-ጥበብ ክፍል', `sort_order` = 4
  WHERE `code` = 'ARTS';

UPDATE `departments`
  SET `code` = 'PROFESSIONAL_SERVICES', `name_en` = 'Professional Services Coordination',
      `name_am` = 'የሙያ አገልግሎት ማስተባበሪያ ክፍል', `description_en` = NULL, `description_am` = NULL, `sort_order` = 5
  WHERE `code` = 'DEVELOPMENT';

UPDATE `departments`
  SET `code` = 'PRAYER_CHARITY', `name_en` = 'Prayer & Charity', `name_am` = 'ጸሎት እና በጎ አድራጎት ክፍል',
      `description_en` = NULL, `description_am` = NULL, `sort_order` = 6
  WHERE `code` = 'CHARITY';

UPDATE `departments`
  SET `code` = 'CHILDREN', `name_en` = 'Children', `name_am` = 'ሕጻናት ክፍል',
      `description_en` = NULL, `description_am` = NULL, `sort_order` = 7
  WHERE `code` = 'PROPERTY';

UPDATE `departments`
  SET `code` = 'MEDIA', `name_en` = 'Media & Communications', `name_am` = 'የመገናኛ ብዙኃን ክፍል',
      `description_en` = NULL, `description_am` = NULL, `sort_order` = 8
  WHERE `code` = 'FINANCE';
