-- CreateTable
CREATE TABLE `class_agreements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class_type_id` INTEGER NOT NULL,
    `title_am` VARCHAR(200) NOT NULL,
    `title_en` VARCHAR(200) NOT NULL,
    `rules_am` TEXT NOT NULL,
    `rules_en` TEXT NOT NULL,
    `pledge_am` TEXT NULL,
    `pledge_en` TEXT NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `class_agreements_class_type_id_key`(`class_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_agreements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `agreement_id` INTEGER NOT NULL,
    `accepted_at` DATETIME(3) NOT NULL,
    `recorded_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_agreements_agreement_id_idx`(`agreement_id`),
    UNIQUE INDEX `member_agreements_member_id_agreement_id_key`(`member_id`, `agreement_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `class_agreements` ADD CONSTRAINT `class_agreements_class_type_id_fkey` FOREIGN KEY (`class_type_id`) REFERENCES `class_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_agreements` ADD CONSTRAINT `member_agreements_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_agreements` ADD CONSTRAINT `member_agreements_agreement_id_fkey` FOREIGN KEY (`agreement_id`) REFERENCES `class_agreements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: the Mezmur class's discipline and code-of-conduct agreement (the
-- paper form's text), when that class exists. Admins edit it on the Classes page.
INSERT INTO `class_agreements`
  (`class_type_id`, `title_am`, `title_en`, `rules_am`, `rules_en`, `pledge_am`, `pledge_en`, `updated_at`)
SELECT `id`,
  'የዲሲፕሊን እና የሥነ-ምግባር ስምምነት',
  'Discipline and Code of Conduct Agreement',
  'የክፍሉን ሥርዓትና ደንብ ማክበር።\nበአገልግሎት ወቅት ተገቢ አለባበስና ባህሪ መከተል።\nከኃላፊዎችና ከሌሎች አባላት ጋር በአክብሮት መግባባት።\nየሰንበት ት/ቤቱንና የክፍሉን ስምና ክብር መጠበቅ።\nየተሰጠኝን ኃላፊነት በታማኝነት መወጣት።\nየክፍሉን ውስጣዊ መረጃ ምስጢራዊነት መጠበቅ።\nየክፍሉን ሥርዓት የሚጥስ ተግባር ከመፈጸም መቆጠብ።',
  'Respect the order and rules of the class.\nDress and behave appropriately during service.\nTreat leaders and fellow members with respect.\nProtect the name and honour of the Sunday school and the class.\nCarry out the responsibilities given to me faithfully.\nKeep the class''s internal information confidential.\nRefrain from any act that breaks the class''s order.',
  'እኔ ከላይ የተጠቀሱትን ደንቦች ተረድቼ በመከተል ተስማምቻለሁ። ይህ ሳይሆን ቢቀር ክፍሉ የሚወስድብኝን ህጋዊ እርምጃ የምቀበል መሆኑን አረጋግጣለሁ።',
  'I have understood the rules above and agree to follow them. If I do not, I accept the action the class takes against me.',
  CURRENT_TIMESTAMP(3)
FROM `class_types` WHERE `code` = 'MEZMUR';

-- Data: acceptances recorded so far were of this same text, so they move to
-- the Mezmur agreement (bot registrations: by the member; others: by the last editor).
INSERT INTO `member_agreements` (`member_id`, `agreement_id`, `accepted_at`, `recorded_by_id`)
SELECT m.`id`, a.`id`, m.`agreement_accepted_at`,
  CASE WHEN m.`self_registered` THEN NULL ELSE m.`updated_by_id` END
FROM `members` m
JOIN `class_agreements` a
  ON a.`class_type_id` = (SELECT `id` FROM `class_types` WHERE `code` = 'MEZMUR')
WHERE m.`agreement_accepted_at` IS NOT NULL;

-- AlterTable
ALTER TABLE `members` DROP COLUMN `agreement_accepted_at`;
