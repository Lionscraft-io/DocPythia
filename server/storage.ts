// Referenced from blueprint:javascript_database
import {
  documentationSections,
  pendingUpdates,
  updateHistory,
  scrapedMessages,
  scrapeMetadata,
  sectionVersions,
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
  type SectionVersion,
  type InsertSectionVersion,
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
  
  // Section versions
  createSectionVersion(version: InsertSectionVersion): Promise<SectionVersion>;
  getSectionHistory(sectionId: string): Promise<SectionVersion[]>;
  rollbackSection(sectionId: string, versionId: string, performedBy?: string): Promise<{ section: DocumentationSection; version: SectionVersion }>;
  
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

  async updatePendingUpdate(
    id: string,
    data: { summary?: string; diffAfter?: string }
  ): Promise<PendingUpdate | undefined> {
    const [updated] = await db
      .update(pendingUpdates)
      .set(data)
      .where(eq(pendingUpdates.id, id))
      .returning();
    return updated || undefined;
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

  // Section versions
  async createSectionVersion(version: InsertSectionVersion): Promise<SectionVersion> {
    const [newVersion] = await db
      .insert(sectionVersions)
      .values(version)
      .returning();
    return newVersion;
  }

  async getSectionHistory(sectionId: string): Promise<SectionVersion[]> {
    return await db
      .select()
      .from(sectionVersions)
      .where(eq(sectionVersions.sectionId, sectionId))
      .orderBy(desc(sectionVersions.createdAt));
  }

  async rollbackSection(
    sectionId: string,
    versionId: string,
    performedBy?: string
  ): Promise<{ section: DocumentationSection; version: SectionVersion }> {
    return await db.transaction(async (tx) => {
      // Get the target version to restore
      const [targetVersion] = await tx
        .select()
        .from(sectionVersions)
        .where(eq(sectionVersions.id, versionId));

      if (!targetVersion) {
        throw new Error("Version not found");
      }

      if (targetVersion.sectionId !== sectionId) {
        throw new Error("Version does not belong to this section");
      }

      // Get latest version before rollback for parentVersionId
      const [latestVersion] = await tx
        .select()
        .from(sectionVersions)
        .where(eq(sectionVersions.sectionId, sectionId))
        .orderBy(desc(sectionVersions.createdAt))
        .limit(1);

      // Check if section currently exists
      const [existingSection] = await tx
        .select()
        .from(documentationSections)
        .where(eq(documentationSections.sectionId, sectionId));

      let section: DocumentationSection;

      if (existingSection) {
        // Update existing section
        const [updated] = await tx
          .update(documentationSections)
          .set({
            title: targetVersion.title,
            content: targetVersion.content,
            level: targetVersion.level,
            type: targetVersion.type,
            orderIndex: targetVersion.orderIndex,
            updatedAt: new Date(),
          })
          .where(eq(documentationSections.sectionId, sectionId))
          .returning();
        section = updated;
      } else {
        // Reinsert deleted section
        const [newSection] = await tx
          .insert(documentationSections)
          .values({
            sectionId: targetVersion.sectionId,
            title: targetVersion.title,
            content: targetVersion.content,
            level: targetVersion.level,
            type: targetVersion.type,
            orderIndex: targetVersion.orderIndex,
          })
          .returning();
        section = newSection;
      }

      // Create rollback version snapshot
      const [rollbackVersion] = await tx
        .insert(sectionVersions)
        .values({
          sectionId: targetVersion.sectionId,
          title: targetVersion.title,
          content: targetVersion.content,
          level: targetVersion.level,
          type: targetVersion.type,
          orderIndex: targetVersion.orderIndex,
          op: "rollback",
          parentVersionId: latestVersion?.id || null,
          fromUpdateId: null,
          fromHistoryId: null,
          createdBy: performedBy || null,
        })
        .returning();

      return { section, version: rollbackVersion };
    });
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

      // Get latest version for parentVersionId
      const [latestVersion] = await tx
        .select()
        .from(sectionVersions)
        .where(eq(sectionVersions.sectionId, update.sectionId))
        .orderBy(desc(sectionVersions.createdAt))
        .limit(1);

      // Handle different operation types
      let section: DocumentationSection | undefined;
      let versionOp: "add" | "edit" | "delete";
      
      if (update.type === "add") {
        // Create a new section
        if (!update.diffAfter) {
          throw new Error("Cannot add section: no content provided");
        }
        
        // Extract title from summary or use section ID
        const titleMatch = update.summary.match(/Add new section: "([^"]+)"/);
        const title = titleMatch ? titleMatch[1] : update.sectionId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        // Get the max orderIndex to place new section at the end
        const sections = await tx.select().from(documentationSections);
        const maxOrder = Math.max(...sections.map(s => s.orderIndex), 0);
        
        const [newSection] = await tx
          .insert(documentationSections)
          .values({
            sectionId: update.sectionId,
            title,
            content: update.diffAfter,
            level: 1, // Default to top level
            orderIndex: maxOrder + 1,
          })
          .returning();
        section = newSection;
        versionOp = "add";
        
      } else if (update.type === "delete") {
        // Delete an existing section - capture snapshot before deletion
        const [existing] = await tx
          .select()
          .from(documentationSections)
          .where(eq(documentationSections.sectionId, update.sectionId));
        
        if (!existing) {
          throw new Error("Cannot delete section: section not found");
        }
        
        section = existing;
        versionOp = "delete";
        
        // Delete the section AFTER we have the snapshot
        await tx
          .delete(documentationSections)
          .where(eq(documentationSections.sectionId, update.sectionId));
          
      } else {
        // Update existing section (minor or major)
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
        versionOp = "edit";
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

      // Create version snapshot
      await tx
        .insert(sectionVersions)
        .values({
          sectionId: section.sectionId,
          title: section.title,
          content: section.content,
          level: section.level,
          type: section.type,
          orderIndex: section.orderIndex,
          op: versionOp,
          parentVersionId: latestVersion?.id || null,
          fromUpdateId: updateId,
          fromHistoryId: newHistory.id,
          createdBy: reviewedBy || null,
        });

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
          lastMessageId: metadata.lastMessageId,
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
