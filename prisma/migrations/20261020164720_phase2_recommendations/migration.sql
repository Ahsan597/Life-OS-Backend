-- CreateTable
CREATE TABLE `recommendations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `habit_id` BIGINT NULL,
    `source` ENUM('rule_based', 'ml_based') NOT NULL DEFAULT 'rule_based',
    `rule` VARCHAR(50) NOT NULL,
    `dedupe_key` VARCHAR(150) NOT NULL,
    `message` TEXT NOT NULL,
    `reason` TEXT NULL,
    `status` ENUM('pending', 'accepted', 'dismissed') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `recommendations_user_id_status_idx`(`user_id`, `status`),
    UNIQUE INDEX `recommendations_user_id_dedupe_key_key`(`user_id`, `dedupe_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recommendations` ADD CONSTRAINT `recommendations_habit_id_fkey` FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
