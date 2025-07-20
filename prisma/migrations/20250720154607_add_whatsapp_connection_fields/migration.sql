-- AlterTable
ALTER TABLE "whatsapp_numbers" ADD COLUMN     "isConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qrCode" TEXT;
