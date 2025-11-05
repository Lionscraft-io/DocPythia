import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Enums for constrained fields
export const sectionTypeEnum = pgEnum("section_type", ["text", "info", "warning", "success"]);
export const updateTypeEnum = pgEnum("update_type", ["minor", "major", "add", "delete"]);
export const updateStatusEnum = pgEnum("update_status", ["pending", "approved", "rejected", "auto-applied"]);
export const actionTypeEnum = pgEnum("action_type", ["approved", "rejected", "auto-applied"]);
export const messageSourceEnum = pgEnum("message_source", ["zulipchat", "telegram"]);
export const versionOpEnum = pgEnum("version_op", ["add", "edit", "delete", "rollback"]);

// Documentation sections table
export const documentationSections = pgTable("documentation_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: text("section_id").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  level: integer("level"),
  type: sectionTypeEnum("type"),
  orderIndex: integer("order_index").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Pending updates table
export const pendingUpdates = pgTable("pending_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: text("section_id").notNull(),
  type: updateTypeEnum("type").notNull(),
  summary: text("summary").notNull(),
  source: text("source").notNull(),
  status: updateStatusEnum("status").notNull().default("pending"),
  diffBefore: text("diff_before"),
  diffAfter: text("diff_after"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"),
});

// Update history table
export const updateHistory = pgTable("update_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  updateId: varchar("update_id").notNull().references(() => pendingUpdates.id, { onDelete: "cascade" }),
  action: actionTypeEnum("action").notNull(),
  performedAt: timestamp("performed_at").notNull().defaultNow(),
  performedBy: text("performed_by"),
});

// Scraped messages table
export const scrapedMessages = pgTable("scraped_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: text("message_id").notNull().unique(),
  source: messageSourceEnum("source").notNull(),
  channelName: text("channel_name").notNull(),
  topicName: text("topic_name"),
  senderEmail: text("sender_email"),
  senderName: text("sender_name"),
  content: text("content").notNull(),
  messageTimestamp: timestamp("message_timestamp").notNull(),
  scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
  analyzed: boolean("analyzed").notNull().default(false),
});

// Scrape metadata table to track last scrape timestamps for incremental scraping
export const scrapeMetadata = pgTable("scrape_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: messageSourceEnum("source").notNull(),
  channelName: text("channel_name").notNull(),
  lastMessageId: text("last_message_id"), // Store last Zulip message ID for anchor
  lastScrapeTimestamp: timestamp("last_scrape_timestamp"),
  lastScrapeAt: timestamp("last_scrape_at").notNull().defaultNow(),
  totalMessagesFetched: integer("total_messages_fetched").notNull().default(0),
});

// Section versions table for rollback functionality
export const sectionVersions = pgTable("section_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: text("section_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  level: integer("level"),
  type: sectionTypeEnum("type"),
  orderIndex: integer("order_index").notNull(),
  op: versionOpEnum("op").notNull(),
  parentVersionId: varchar("parent_version_id"),
  fromUpdateId: varchar("from_update_id").references(() => pendingUpdates.id, { onDelete: "set null" }),
  fromHistoryId: varchar("from_history_id").references(() => updateHistory.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by"),
});

// Relations
export const documentationSectionsRelations = relations(documentationSections, ({ many }) => ({
  pendingUpdates: many(pendingUpdates),
}));

export const pendingUpdatesRelations = relations(pendingUpdates, ({ one, many }) => ({
  documentationSection: one(documentationSections, {
    fields: [pendingUpdates.sectionId],
    references: [documentationSections.sectionId],
  }),
  history: many(updateHistory),
}));

export const updateHistoryRelations = relations(updateHistory, ({ one }) => ({
  pendingUpdate: one(pendingUpdates, {
    fields: [updateHistory.updateId],
    references: [pendingUpdates.id],
  }),
}));

export const scrapedMessagesRelations = relations(scrapedMessages, ({ many }) => ({
  pendingUpdates: many(pendingUpdates),
}));

export const sectionVersionsRelations = relations(sectionVersions, ({ one }) => ({
  pendingUpdate: one(pendingUpdates, {
    fields: [sectionVersions.fromUpdateId],
    references: [pendingUpdates.id],
  }),
  updateHistory: one(updateHistory, {
    fields: [sectionVersions.fromHistoryId],
    references: [updateHistory.id],
  }),
}));

// Insert schemas
export const insertDocumentationSectionSchema = createInsertSchema(documentationSections).omit({
  id: true,
  updatedAt: true,
});

export const insertPendingUpdateSchema = createInsertSchema(pendingUpdates).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});

export const insertUpdateHistorySchema = createInsertSchema(updateHistory).omit({
  id: true,
  performedAt: true,
});

export const insertScrapedMessageSchema = createInsertSchema(scrapedMessages).omit({
  id: true,
  scrapedAt: true,
});

export const insertScrapeMetadataSchema = createInsertSchema(scrapeMetadata).omit({
  id: true,
  lastScrapeAt: true,
});

export const insertSectionVersionSchema = createInsertSchema(sectionVersions).omit({
  id: true,
  createdAt: true,
});

// Types
export type DocumentationSection = typeof documentationSections.$inferSelect;
export type InsertDocumentationSection = z.infer<typeof insertDocumentationSectionSchema>;

export type PendingUpdate = typeof pendingUpdates.$inferSelect;
export type InsertPendingUpdate = z.infer<typeof insertPendingUpdateSchema>;

export type UpdateHistory = typeof updateHistory.$inferSelect;
export type InsertUpdateHistory = z.infer<typeof insertUpdateHistorySchema>;

export type ScrapedMessage = typeof scrapedMessages.$inferSelect;
export type InsertScrapedMessage = z.infer<typeof insertScrapedMessageSchema>;

export type ScrapeMetadata = typeof scrapeMetadata.$inferSelect;
export type InsertScrapeMetadata = z.infer<typeof insertScrapeMetadataSchema>;

export type SectionVersion = typeof sectionVersions.$inferSelect;
export type InsertSectionVersion = z.infer<typeof insertSectionVersionSchema>;
