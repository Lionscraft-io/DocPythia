-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('draft', 'submitted', 'merged', 'closed');

-- AlterTable
ALTER TABLE "doc_proposals" ADD COLUMN     "pr_application_error" TEXT,
ADD COLUMN     "pr_application_status" TEXT,
ADD COLUMN     "pr_batch_id" INTEGER;

-- CreateTable
CREATE TABLE "changeset_batches" (
    "id" SERIAL NOT NULL,
    "batch_id" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'draft',
    "pr_title" TEXT,
    "pr_body" TEXT,
    "pr_url" TEXT,
    "pr_number" INTEGER,
    "branch_name" TEXT,
    "total_proposals" INTEGER NOT NULL,
    "affected_files" JSONB NOT NULL,
    "target_repo" TEXT,
    "source_repo" TEXT,
    "base_branch" TEXT DEFAULT 'main',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "submitted_by" TEXT,

    CONSTRAINT "changeset_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_proposals" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "proposal_id" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_failures" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "proposal_id" INTEGER NOT NULL,
    "failure_type" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "changeset_batches_batch_id_key" ON "changeset_batches"("batch_id");

-- CreateIndex
CREATE INDEX "changeset_batches_status_idx" ON "changeset_batches"("status");

-- CreateIndex
CREATE INDEX "changeset_batches_submitted_at_idx" ON "changeset_batches"("submitted_at");

-- CreateIndex
CREATE INDEX "batch_proposals_batch_id_idx" ON "batch_proposals"("batch_id");

-- CreateIndex
CREATE INDEX "batch_proposals_proposal_id_idx" ON "batch_proposals"("proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "batch_proposals_batch_id_proposal_id_key" ON "batch_proposals"("batch_id", "proposal_id");

-- CreateIndex
CREATE INDEX "proposal_failures_batch_id_idx" ON "proposal_failures"("batch_id");

-- CreateIndex
CREATE INDEX "proposal_failures_proposal_id_idx" ON "proposal_failures"("proposal_id");

-- CreateIndex
CREATE INDEX "doc_proposals_pr_batch_id_idx" ON "doc_proposals"("pr_batch_id");

-- AddForeignKey
ALTER TABLE "doc_proposals" ADD CONSTRAINT "doc_proposals_pr_batch_id_fkey" FOREIGN KEY ("pr_batch_id") REFERENCES "changeset_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_proposals" ADD CONSTRAINT "batch_proposals_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "changeset_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_proposals" ADD CONSTRAINT "batch_proposals_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "doc_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_failures" ADD CONSTRAINT "proposal_failures_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "changeset_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_failures" ADD CONSTRAINT "proposal_failures_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "doc_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
