-- Install pgvector extension for vector embeddings (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('text', 'info', 'warning', 'success');

-- CreateEnum
CREATE TYPE "UpdateType" AS ENUM ('minor', 'major', 'add', 'delete');

-- CreateEnum
CREATE TYPE "UpdateStatus" AS ENUM ('pending', 'approved', 'rejected', 'auto_applied');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('approved', 'rejected', 'auto_applied');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('zulipchat', 'telegram');

-- CreateEnum
CREATE TYPE "VersionOp" AS ENUM ('add', 'edit', 'delete', 'rollback');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('pending', 'approved', 'ignored');

-- CreateTable
CREATE TABLE "documentation_sections" (
    "id" UUID NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "level" INTEGER,
    "type" "SectionType",
    "orderIndex" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentation_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_updates" (
    "id" UUID NOT NULL,
    "sectionId" TEXT NOT NULL,
    "type" "UpdateType" NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "UpdateStatus" NOT NULL DEFAULT 'pending',
    "diffBefore" TEXT,
    "diffAfter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "pending_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "update_history" (
    "id" UUID NOT NULL,
    "updateId" UUID NOT NULL,
    "action" "ActionType" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,

    CONSTRAINT "update_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraped_messages" (
    "id" UUID NOT NULL,
    "messageId" TEXT NOT NULL,
    "source" "MessageSource" NOT NULL,
    "channelName" TEXT NOT NULL,
    "topicName" TEXT,
    "senderEmail" TEXT,
    "senderName" TEXT,
    "content" TEXT NOT NULL,
    "messageTimestamp" TIMESTAMP(3) NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "scraped_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_metadata" (
    "id" UUID NOT NULL,
    "source" "MessageSource" NOT NULL,
    "channelName" TEXT NOT NULL,
    "lastMessageId" TEXT,
    "lastScrapeTimestamp" TIMESTAMP(3),
    "lastScrapeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMessagesFetched" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scrape_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_versions" (
    "id" UUID NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "level" INTEGER,
    "type" "SectionType",
    "orderIndex" INTEGER NOT NULL,
    "op" "VersionOp" NOT NULL,
    "parentVersionId" UUID,
    "fromUpdateId" UUID,
    "fromHistoryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "section_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_pages" (
    "id" SERIAL NOT NULL,
    "file_path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "commit_hash" TEXT NOT NULL,
    "git_url" TEXT NOT NULL,
    "embedding" vector(768),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_sync_state" (
    "id" SERIAL NOT NULL,
    "git_url" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "last_commit_hash" TEXT,
    "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "error_message" TEXT,

    CONSTRAINT "git_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_index_cache" (
    "id" SERIAL NOT NULL,
    "commit_hash" TEXT NOT NULL,
    "config_hash" TEXT NOT NULL,
    "index_data" JSONB NOT NULL,
    "compact_index" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_index_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_configs" (
    "id" SERIAL NOT NULL,
    "stream_id" TEXT NOT NULL,
    "adapter_type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_watermarks" (
    "id" SERIAL NOT NULL,
    "stream_id" TEXT NOT NULL,
    "stream_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "last_imported_time" TIMESTAMP(3),
    "last_imported_id" TEXT,
    "import_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_watermarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_watermark" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "watermark_time" TIMESTAMP(3) NOT NULL,
    "last_processed_batch" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_watermark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unified_messages" (
    "id" SERIAL NOT NULL,
    "stream_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "author" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "channel" TEXT,
    "raw_data" JSONB NOT NULL,
    "metadata" JSONB,
    "embedding" vector(768),
    "processing_status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unified_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_classification" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "batch_id" TEXT,
    "conversation_id" TEXT,
    "category" TEXT NOT NULL,
    "doc_value_reason" TEXT NOT NULL,
    "suggested_doc_page" TEXT,
    "rag_search_criteria" JSONB,
    "model_used" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_classification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_rag_context" (
    "id" SERIAL NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "summary" VARCHAR(200),
    "retrieved_docs" JSONB NOT NULL,
    "total_tokens" INTEGER,
    "proposals_rejected" BOOLEAN,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_rag_context_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_proposals" (
    "id" SERIAL NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "page" TEXT NOT NULL,
    "update_type" TEXT NOT NULL,
    "section" TEXT,
    "location" JSONB,
    "suggested_text" TEXT,
    "reasoning" TEXT,
    "source_messages" JSONB,
    "status" "ProposalStatus" NOT NULL DEFAULT 'pending',
    "edited_text" TEXT,
    "edited_at" TIMESTAMP(3),
    "edited_by" TEXT,
    "admin_approved" BOOLEAN NOT NULL DEFAULT false,
    "admin_reviewed_at" TIMESTAMP(3),
    "admin_reviewed_by" TEXT,
    "discard_reason" TEXT,
    "model_used" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documentation_sections_sectionId_key" ON "documentation_sections"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "scraped_messages_messageId_key" ON "scraped_messages"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "document_pages_file_path_commit_hash_key" ON "document_pages"("file_path", "commit_hash");

-- CreateIndex
CREATE UNIQUE INDEX "git_sync_state_git_url_key" ON "git_sync_state"("git_url");

-- CreateIndex
CREATE UNIQUE INDEX "doc_index_cache_commit_hash_config_hash_key" ON "doc_index_cache"("commit_hash", "config_hash");

-- CreateIndex
CREATE UNIQUE INDEX "stream_configs_stream_id_key" ON "stream_configs"("stream_id");

-- CreateIndex
CREATE INDEX "import_watermarks_stream_id_resource_id_idx" ON "import_watermarks"("stream_id", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_watermarks_stream_id_resource_id_key" ON "import_watermarks"("stream_id", "resource_id");

-- CreateIndex
CREATE INDEX "unified_messages_timestamp_idx" ON "unified_messages"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "unified_messages_processing_status_idx" ON "unified_messages"("processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "unified_messages_stream_id_message_id_key" ON "unified_messages"("stream_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_classification_message_id_key" ON "message_classification"("message_id");

-- CreateIndex
CREATE INDEX "message_classification_batch_id_idx" ON "message_classification"("batch_id");

-- CreateIndex
CREATE INDEX "message_classification_conversation_id_idx" ON "message_classification"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_rag_context_conversation_id_key" ON "conversation_rag_context"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_rag_context_batch_id_idx" ON "conversation_rag_context"("batch_id");

-- CreateIndex
CREATE INDEX "doc_proposals_conversation_id_idx" ON "doc_proposals"("conversation_id");

-- CreateIndex
CREATE INDEX "doc_proposals_batch_id_idx" ON "doc_proposals"("batch_id");

-- CreateIndex
CREATE INDEX "doc_proposals_status_idx" ON "doc_proposals"("status");

-- CreateIndex
CREATE INDEX "doc_proposals_admin_approved_idx" ON "doc_proposals"("admin_approved");

-- AddForeignKey
ALTER TABLE "update_history" ADD CONSTRAINT "update_history_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "pending_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_versions" ADD CONSTRAINT "section_versions_fromUpdateId_fkey" FOREIGN KEY ("fromUpdateId") REFERENCES "pending_updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_versions" ADD CONSTRAINT "section_versions_fromHistoryId_fkey" FOREIGN KEY ("fromHistoryId") REFERENCES "update_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_watermarks" ADD CONSTRAINT "import_watermarks_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "stream_configs"("stream_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unified_messages" ADD CONSTRAINT "unified_messages_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "stream_configs"("stream_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_classification" ADD CONSTRAINT "message_classification_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "unified_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
