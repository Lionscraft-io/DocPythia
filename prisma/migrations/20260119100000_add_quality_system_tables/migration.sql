-- AlterTable: Add quality system fields to doc_proposals
ALTER TABLE "doc_proposals" ADD COLUMN "enrichment" JSONB;

-- CreateTable: tenant_rulesets
CREATE TABLE "tenant_rulesets" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_rulesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tenant_prompt_overrides
CREATE TABLE "tenant_prompt_overrides" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_prompt_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ruleset_feedback
CREATE TABLE "ruleset_feedback" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "proposal_id" INTEGER,
    "action_taken" TEXT NOT NULL,
    "feedback_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "ruleset_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable: proposal_review_logs
CREATE TABLE "proposal_review_logs" (
    "id" SERIAL NOT NULL,
    "proposal_id" INTEGER NOT NULL,
    "ruleset_version" TIMESTAMP(3) NOT NULL,
    "original_content" TEXT,
    "modifications_applied" JSONB,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" TEXT,
    "quality_flags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_rulesets_tenant_id_key" ON "tenant_rulesets"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_prompt_overrides_tenant_id_idx" ON "tenant_prompt_overrides"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_prompt_overrides_tenant_id_prompt_key_key" ON "tenant_prompt_overrides"("tenant_id", "prompt_key");

-- CreateIndex
CREATE INDEX "ruleset_feedback_tenant_id_idx" ON "ruleset_feedback"("tenant_id");

-- CreateIndex
CREATE INDEX "ruleset_feedback_proposal_id_idx" ON "ruleset_feedback"("proposal_id");

-- CreateIndex
CREATE INDEX "ruleset_feedback_processed_at_idx" ON "ruleset_feedback"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_review_logs_proposal_id_key" ON "proposal_review_logs"("proposal_id");

-- CreateIndex
CREATE INDEX "proposal_review_logs_proposal_id_idx" ON "proposal_review_logs"("proposal_id");

-- AddForeignKey
ALTER TABLE "ruleset_feedback" ADD CONSTRAINT "ruleset_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant_rulesets"("tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ruleset_feedback" ADD CONSTRAINT "ruleset_feedback_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "doc_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_review_logs" ADD CONSTRAINT "proposal_review_logs_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "doc_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
