// Referenced from blueprint:javascript_database
import {
  documentationSections,
  pendingUpdates,
  updateHistory,
  scrapedMessages,
  scrapeMetadata,
  type DocumentationSection,
  type InsertDocumentationSection,
  type PendingUpdate,
  type InsertPendingUpdate,
  type UpdateHistory,
  type InsertUpdateHistory,
  type ScrapedMessage,
  type InsertScrapedMessage,
  type ScrapeMetadata,
  type InsertScrapeMetadata,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Documentation sections
  getDocumentationSections(): Promise<DocumentationSection[]>;
  getDocumentationSection(sectionId: string): Promise<DocumentationSection | undefined>;
  createDocumentationSection(section: InsertDocumentationSection): Promise<DocumentationSection>;
  updateDocumentationSection(sectionId: string, content: string): Promise<DocumentationSection>;
  
  // Pending updates
  getPendingUpdates(): Promise<PendingUpdate[]>;
  getPendingUpdate(id: string): Promise<PendingUpdate | undefined>;
  createPendingUpdate(update: InsertPendingUpdate): Promise<PendingUpdate>;
  updatePendingUpdateStatus(
    id: string,
    status: "pending" | "approved" | "rejected" | "auto-applied",
    reviewedBy?: string
  ): Promise<PendingUpdate | undefined>;
  approveUpdate(
    updateId: string,
    reviewedBy?: string
  ): Promise<{ update: PendingUpdate; section: DocumentationSection; history: UpdateHistory }>;
  rejectUpdate(
    updateId: string,
    reviewedBy?: string
  ): Promise<{ update: PendingUpdate; history: UpdateHistory }>;
  
  // Update history
  createUpdateHistory(history: InsertUpdateHistory): Promise<UpdateHistory>;
  getUpdateHistory(): Promise<UpdateHistory[]>;
  
  // Scraped messages
  getScrapedMessages(): Promise<ScrapedMessage[]>;
  getUnanalyzedMessages(): Promise<ScrapedMessage[]>;
  createScrapedMessage(message: InsertScrapedMessage): Promise<ScrapedMessage>;
  markMessageAsAnalyzed(id: string): Promise<ScrapedMessage | undefined>;
  getMessageByMessageId(messageId: string): Promise<ScrapedMessage | undefined>;
  
  // Scrape metadata
  getScrapeMetadata(source: "zulipchat" | "telegram", channelName: string): Promise<ScrapeMetadata | undefined>;
  createOrUpdateScrapeMetadata(metadata: InsertScrapeMetadata): Promise<ScrapeMetadata>;
}

export class DatabaseStorage implements IStorage {
  // Documentation sections
  async getDocumentationSections(): Promise<DocumentationSection[]> {
    return await db
      .select()
      .from(documentationSections)
      .orderBy(documentationSections.orderIndex);
  }

  async getDocumentationSection(sectionId: string): Promise<DocumentationSection | undefined> {
    const [section] = await db
      .select()
      .from(documentationSections)
      .where(eq(documentationSections.sectionId, sectionId));
    return section || undefined;
  }

  async createDocumentationSection(
    section: InsertDocumentationSection
  ): Promise<DocumentationSection> {
    const [newSection] = await db
      .insert(documentationSections)
      .values(section)
      .returning();
    return newSection;
  }

  async updateDocumentationSection(
    sectionId: string,
    content: string
  ): Promise<DocumentationSection> {
    const [updated] = await db
      .update(documentationSections)
      .set({ content, updatedAt: new Date() })
      .where(eq(documentationSections.sectionId, sectionId))
      .returning();
    return updated;
  }

  // Pending updates
  async getPendingUpdates(): Promise<PendingUpdate[]> {
    return await db
      .select()
      .from(pendingUpdates)
      .orderBy(desc(pendingUpdates.createdAt));
  }

  async getPendingUpdate(id: string): Promise<PendingUpdate | undefined> {
    const [update] = await db
      .select()
      .from(pendingUpdates)
      .where(eq(pendingUpdates.id, id));
    return update || undefined;
  }

  async createPendingUpdate(update: InsertPendingUpdate): Promise<PendingUpdate> {
    const [newUpdate] = await db
      .insert(pendingUpdates)
      .values(update)
      .returning();
    return newUpdate;
  }

  async updatePendingUpdateStatus(
    id: string,
    status: "pending" | "approved" | "rejected" | "auto-applied",
    reviewedBy?: string
  ): Promise<PendingUpdate | undefined> {
    const [updated] = await db
      .update(pendingUpdates)
      .set({
        status,
        reviewedAt: new Date(),
        reviewedBy: reviewedBy || null,
      })
      .where(eq(pendingUpdates.id, id))
      .returning();
    return updated || undefined;
  }

  // Update history
  async createUpdateHistory(history: InsertUpdateHistory): Promise<UpdateHistory> {
    const [newHistory] = await db
      .insert(updateHistory)
      .values(history)
      .returning();
    return newHistory;
  }

  async getUpdateHistory(): Promise<UpdateHistory[]> {
    return await db
      .select()
      .from(updateHistory)
      .orderBy(desc(updateHistory.performedAt));
  }

  // Transactional approval: apply documentation change, update status, and log history
  async approveUpdate(
    updateId: string,
    reviewedBy?: string
  ): Promise<{ update: PendingUpdate; section: DocumentationSection; history: UpdateHistory }> {
    return await db.transaction(async (tx) => {
      // Get the pending update
      const [update] = await tx
        .select()
        .from(pendingUpdates)
        .where(eq(pendingUpdates.id, updateId));

      if (!update) {
        throw new Error("Update not found");
      }

      // Enforce status='pending' - cannot approve already processed updates
      if (update.status !== "pending") {
        throw new Error("Cannot approve update: status must be pending");
      }

      // Apply the change to the documentation if diffAfter is provided
      let section: DocumentationSection | undefined;
      if (update.diffAfter) {
        const [updated] = await tx
          .update(documentationSections)
          .set({ content: update.diffAfter, updatedAt: new Date() })
          .where(eq(documentationSections.sectionId, update.sectionId))
          .returning();
        section = updated;
      } else {
        const [existing] = await tx
          .select()
          .from(documentationSections)
          .where(eq(documentationSections.sectionId, update.sectionId));
        section = existing;
      }

      if (!section) {
        throw new Error("Documentation section not found");
      }

      // Mark update as approved
      const [approvedUpdate] = await tx
        .update(pendingUpdates)
        .set({
          status: "approved",
          reviewedAt: new Date(),
          reviewedBy: reviewedBy || null,
        })
        .where(eq(pendingUpdates.id, updateId))
        .returning();

      // Create history record
      const [newHistory] = await tx
        .insert(updateHistory)
        .values({
          updateId,
          action: "approved",
          performedBy: reviewedBy || null,
        })
        .returning();

      return { update: approvedUpdate, section, history: newHistory };
    });
  }

  // Transactional rejection: update status and log history
  async rejectUpdate(
    updateId: string,
    reviewedBy?: string
  ): Promise<{ update: PendingUpdate; history: UpdateHistory }> {
    return await db.transaction(async (tx) => {
      // Get the pending update
      const [update] = await tx
        .select()
        .from(pendingUpdates)
        .where(eq(pendingUpdates.id, updateId));

      if (!update) {
        throw new Error("Update not found");
      }

      // Enforce status='pending' - cannot reject already processed updates
      if (update.status !== "pending") {
        throw new Error("Cannot reject update: status must be pending");
      }

      // Mark update as rejected
      const [rejectedUpdate] = await tx
        .update(pendingUpdates)
        .set({
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: reviewedBy || null,
        })
        .where(eq(pendingUpdates.id, updateId))
        .returning();

      // Create history record
      const [newHistory] = await tx
        .insert(updateHistory)
        .values({
          updateId,
          action: "rejected",
          performedBy: reviewedBy || null,
        })
        .returning();

      return { update: rejectedUpdate, history: newHistory };
    });
  }

  // Scraped messages
  async getScrapedMessages(): Promise<ScrapedMessage[]> {
    return await db
      .select()
      .from(scrapedMessages)
      .orderBy(desc(scrapedMessages.messageTimestamp));
  }

  async getUnanalyzedMessages(): Promise<ScrapedMessage[]> {
    return await db
      .select()
      .from(scrapedMessages)
      .where(eq(scrapedMessages.analyzed, false))
      .orderBy(scrapedMessages.messageTimestamp);
  }

  async createScrapedMessage(message: InsertScrapedMessage): Promise<ScrapedMessage> {
    const [newMessage] = await db
      .insert(scrapedMessages)
      .values(message)
      .returning();
    return newMessage;
  }

  async markMessageAsAnalyzed(id: string): Promise<ScrapedMessage | undefined> {
    const [updated] = await db
      .update(scrapedMessages)
      .set({ analyzed: true })
      .where(eq(scrapedMessages.id, id))
      .returning();
    return updated || undefined;
  }

  async getMessageByMessageId(messageId: string): Promise<ScrapedMessage | undefined> {
    const [message] = await db
      .select()
      .from(scrapedMessages)
      .where(eq(scrapedMessages.messageId, messageId));
    return message || undefined;
  }

  // Scrape metadata
  async getScrapeMetadata(
    source: "zulipchat" | "telegram",
    channelName: string
  ): Promise<ScrapeMetadata | undefined> {
    const [metadata] = await db
      .select()
      .from(scrapeMetadata)
      .where(
        and(
          eq(scrapeMetadata.source, source),
          eq(scrapeMetadata.channelName, channelName)
        )
      );
    return metadata || undefined;
  }

  async createOrUpdateScrapeMetadata(metadata: InsertScrapeMetadata): Promise<ScrapeMetadata> {
    const existing = await this.getScrapeMetadata(metadata.source, metadata.channelName);
    
    if (existing) {
      // Update existing record
      const [updated] = await db
        .update(scrapeMetadata)
        .set({
          lastScrapeTimestamp: metadata.lastScrapeTimestamp,
          lastScrapeAt: new Date(),
          totalMessagesFetched: existing.totalMessagesFetched + metadata.totalMessagesFetched,
        })
        .where(eq(scrapeMetadata.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new record
      const [newMetadata] = await db
        .insert(scrapeMetadata)
        .values(metadata)
        .returning();
      return newMetadata;
    }
  }
}

export const storage = new DatabaseStorage();
