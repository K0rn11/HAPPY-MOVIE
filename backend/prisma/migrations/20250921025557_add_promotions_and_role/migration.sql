-- AlterTable
ALTER TABLE `order` ADD COLUMN `discountAmt` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `promoCode` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE `promotion` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `value` DOUBLE NOT NULL,
    `maxDiscount` DOUBLE NULL,
    `minSpend` DOUBLE NULL,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `usageLimit` INTEGER NULL,
    `usagePerUser` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `promotion_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promotionredemption` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `promotionId` BIGINT NOT NULL,
    `userId` BIGINT NULL,
    `orderId` BIGINT NULL,
    `email` VARCHAR(191) NULL,
    `redeemedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PromotionRedemption_promotionId_fkey`(`promotionId`),
    INDEX `PromotionRedemption_userId_fkey`(`userId`),
    INDEX `PromotionRedemption_orderId_fkey`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `promotionredemption` ADD CONSTRAINT `PromotionRedemption_promotionId_fkey` FOREIGN KEY (`promotionId`) REFERENCES `promotion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promotionredemption` ADD CONSTRAINT `PromotionRedemption_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promotionredemption` ADD CONSTRAINT `PromotionRedemption_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
