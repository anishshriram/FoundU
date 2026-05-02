-- Enable pgvector extension (required for embedding_vector column)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AccountStanding" AS ENUM ('active', 'suspended', 'banned');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('pending', 'mutual', 'expired');

-- CreateEnum
CREATE TYPE "IntroStatus" AS ENUM ('dormant', 'pending', 'mutual', 'expired');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('instagram', 'phone_number');

-- CreateEnum
CREATE TYPE "VenueCategory" AS ENUM ('bar', 'party', 'library', 'campus_space', 'restaurant', 'other');

-- CreateEnum
CREATE TYPE "VenueSource" AS ENUM ('google_places', 'foursquare');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('inappropriate_behavior', 'harassment', 'fake_profile', 'spam', 'other');

-- CreateEnum
CREATE TYPE "BEventType" AS ENUM ('report_received', 'block_received', 'screenshot_detected', 'multiple_accounts_detected', 'passive_recovery');

-- CreateTable
CREATE TABLE "prompts" (
    "id" SERIAL NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "prompt_id" INTEGER,
    "prompt_answer" TEXT,
    "age" INTEGER NOT NULL,
    "gender_identity" TEXT NOT NULL,
    "preferences" JSONB,
    "gender_preference" TEXT NOT NULL,
    "age_range_min" INTEGER NOT NULL,
    "age_range_max" INTEGER NOT NULL,
    "home_base_latitude" DECIMAL(9,6),
    "home_base_longitude" DECIMAL(9,6),
    "embedding_vector" vector(384),
    "embedding_updated_at" TIMESTAMP(3),
    "is_open" BOOLEAN NOT NULL DEFAULT false,
    "behavioral_score" INTEGER NOT NULL DEFAULT 100,
    "account_standing" "AccountStanding" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" SERIAL NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "receiver_id" INTEGER NOT NULL,
    "status" "SignalStatus" NOT NULL DEFAULT 'pending',
    "sender_viewed_icebreaker" BOOLEAN NOT NULL DEFAULT false,
    "receiver_viewed_icebreaker" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "mutually_matched_at" TIMESTAMP(3),

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intros" (
    "id" SERIAL NOT NULL,
    "signal_id" INTEGER NOT NULL,
    "initiator_id" INTEGER,
    "sender_contact_type" "ContactType",
    "sender_contact_value" TEXT,
    "receiver_contact_type" "ContactType",
    "receiver_contact_value" TEXT,
    "status" "IntroStatus" NOT NULL DEFAULT 'dormant',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "intros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VenueCategory" NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "address" TEXT NOT NULL,
    "source" "VenueSource" NOT NULL,
    "external_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "reported_id" INTEGER NOT NULL,
    "signal_id" INTEGER,
    "warm_intro_id" INTEGER,
    "reason" "ReportReason" NOT NULL,
    "reason_detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" SERIAL NOT NULL,
    "blocker_id" INTEGER NOT NULL,
    "blocked_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bevents" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event_type" "BEventType" NOT NULL,
    "score_delta" INTEGER NOT NULL,
    "triggered_by_id" INTEGER,
    "report_id" INTEGER,
    "block_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bevents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "idx_users_gender_preference" ON "users"("gender_preference");

-- CreateIndex
CREATE INDEX "idx_users_age_range" ON "users"("age_range_min", "age_range_max");

-- CreateIndex
CREATE UNIQUE INDEX "intros_signal_id_key" ON "intros"("signal_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blocker_id_blocked_id_key" ON "blocks"("blocker_id", "blocked_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intros" ADD CONSTRAINT "intros_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intros" ADD CONSTRAINT "intros_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_warm_intro_id_fkey" FOREIGN KEY ("warm_intro_id") REFERENCES "intros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bevents" ADD CONSTRAINT "bevents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bevents" ADD CONSTRAINT "bevents_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bevents" ADD CONSTRAINT "bevents_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bevents" ADD CONSTRAINT "bevents_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
