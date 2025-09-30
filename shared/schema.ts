import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Enums for constrained fields
export const sectionTypeEnum = pgEnum("section_type", ["text", "info", "warning", "success"]);
export const updateTypeEnum = pgEnum("update_type", ["minor", "major"]);
export const updateStatusEnum = pgEnum("update_status", ["pending", "approved", "rejected", "auto-applied"]);
export const actionTypeEnum = pgEnum("action_type", ["approved", "rejected", "auto-applied"]);

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
  sectionId: text("section_id").notNull().references(() => documentationSections.sectionId, { onDelete: "cascade" }),
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

// Types
export type DocumentationSection = typeof documentationSections.$inferSelect;
export type InsertDocumentationSection = z.infer<typeof insertDocumentationSectionSchema>;

export type PendingUpdate = typeof pendingUpdates.$inferSelect;
export type InsertPendingUpdate = z.infer<typeof insertPendingUpdateSchema>;

export type UpdateHistory = typeof updateHistory.$inferSelect;
export type InsertUpdateHistory = z.infer<typeof insertUpdateHistorySchema>;
