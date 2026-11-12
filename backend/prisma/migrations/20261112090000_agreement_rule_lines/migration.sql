-- Data: saving an agreement from the web used to squash its line breaks, so
-- the rules (one per line) became one paragraph. Put each rule back on its own
-- line, at every sentence end. Only rows that lost their line breaks change.
UPDATE `class_agreements`
SET `rules_am` = REPLACE(`rules_am`, '። ', CONCAT('።', CHAR(10)))
WHERE LOCATE(CHAR(10), `rules_am`) = 0;

UPDATE `class_agreements`
SET `rules_en` = REPLACE(`rules_en`, '. ', CONCAT('.', CHAR(10)))
WHERE LOCATE(CHAR(10), `rules_en`) = 0;
