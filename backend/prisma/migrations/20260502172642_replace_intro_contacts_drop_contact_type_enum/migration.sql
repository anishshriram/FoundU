/*
  Warnings:

  - You are about to drop the column `receiver_contact_type` on the `intros` table. All the data in the column will be lost.
  - You are about to drop the column `receiver_contact_value` on the `intros` table. All the data in the column will be lost.
  - You are about to drop the column `sender_contact_type` on the `intros` table. All the data in the column will be lost.
  - You are about to drop the column `sender_contact_value` on the `intros` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_embedding_vector_idx";

-- AlterTable
ALTER TABLE "intros" DROP COLUMN "receiver_contact_type",
DROP COLUMN "receiver_contact_value",
DROP COLUMN "sender_contact_type",
DROP COLUMN "sender_contact_value",
ADD COLUMN     "receiver_instagram" TEXT,
ADD COLUMN     "receiver_phone_number" TEXT,
ADD COLUMN     "sender_instagram" TEXT,
ADD COLUMN     "sender_phone_number" TEXT;

-- DropEnum
DROP TYPE "ContactType";
