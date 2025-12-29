import { Router, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { createZulipchatScraperFromEnv } from "../scraper/zulipchat";
import { createAnalyzerFromEnv } from "../analyzer/gemini-analyzer";
import { triggerJobManually } from "../scheduler";
import { llmCache } from "../llm/llm-cache.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger('AdminPanelRoutes');

// Validation schemas
const updateIdSchema = z.object({
  id: z.string().uuid(),
});

const approveRejectBodySchema = z.object({
  reviewedBy: z.string().optional(),
});

const editUpdateBodySchema = z.object({
  summary: z.string().optional(),
  diffAfter: z.string().optional(),
});

export function createAdminPanelRoutes(adminAuth: RequestHandler): Router {
  const router = Router();

  // ==================== PENDING UPDATES ROUTES ====================

  router.get("/updates", adminAuth, async (req: Request, res: Response) => {
    try {
      const updates = await storage.getPendingUpdates();
      res.json(updates);
    } catch (error) {
      logger.error("Error fetching updates:", error);
      res.status(500).json({ error: "Failed to fetch updates" });
    }
  });

  router.post("/updates/:id/approve", adminAuth, async (req: Request, res: Response) => {
    try {
      const paramsValidation = updateIdSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        return res.status(400).json({ error: "Invalid update ID" });
      }

      const bodyValidation = approveRejectBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const result = await storage.approveUpdate(
        paramsValidation.data.id,
        bodyValidation.data.reviewedBy
      );
      res.json(result);
    } catch (error: any) {
      logger.error("Error approving update:", error);
      if (error.message === "Update not found" || error.message === "Documentation section not found") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === "Cannot approve update: status must be pending") {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to approve update" });
    }
  });

  router.patch("/updates/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const paramsValidation = updateIdSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        return res.status(400).json({ error: "Invalid update ID" });
      }

      const bodyValidation = editUpdateBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const update = await storage.updatePendingUpdate(
        paramsValidation.data.id,
        bodyValidation.data
      );

      if (!update) {
        return res.status(404).json({ error: "Update not found" });
      }

      res.json(update);
    } catch (error: any) {
      logger.error("Error updating pending update:", error);
      res.status(500).json({ error: "Failed to update pending update" });
    }
  });

  router.post("/updates/:id/reject", adminAuth, async (req: Request, res: Response) => {
    try {
      const paramsValidation = updateIdSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        return res.status(400).json({ error: "Invalid update ID" });
      }

      const bodyValidation = approveRejectBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const result = await storage.rejectUpdate(
        paramsValidation.data.id,
        bodyValidation.data.reviewedBy
      );
      res.json(result);
    } catch (error: any) {
      logger.error("Error rejecting update:", error);
      if (error.message === "Update not found") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === "Cannot reject update: status must be pending") {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to reject update" });
    }
  });

  // ==================== UPDATE HISTORY ROUTES ====================

  router.get("/history", adminAuth, async (req: Request, res: Response) => {
    try {
      const history = await storage.getUpdateHistory();
      res.json(history);
    } catch (error) {
      logger.error("Error fetching history:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // ==================== SCRAPED MESSAGES ROUTES ====================

  router.get("/messages", adminAuth, async (req: Request, res: Response) => {
    try {
      const messages = await storage.getScrapedMessages();
      res.json(messages);
    } catch (error) {
      logger.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  router.get("/messages/unanalyzed", adminAuth, async (req: Request, res: Response) => {
    try {
      const messages = await storage.getUnanalyzedMessages();
      res.json(messages);
    } catch (error) {
      logger.error("Error fetching unanalyzed messages:", error);
      res.status(500).json({ error: "Failed to fetch unanalyzed messages" });
    }
  });

  // ==================== SCRAPER ENDPOINT ====================

  router.post("/scrape", adminAuth, async (req: Request, res: Response) => {
    try {
      const scraper = createZulipchatScraperFromEnv();

      if (!scraper) {
        return res.status(500).json({
          error: "Zulipchat scraper not configured. Please set ZULIP_BOT_EMAIL and ZULIP_API_KEY environment variables."
        });
      }

      // Test connection first to fail fast on bad credentials
      const connectionOk = await scraper.testConnection();
      if (!connectionOk) {
        return res.status(500).json({
          error: "Failed to connect to Zulipchat. Please check your credentials."
        });
      }

      const bodyValidation = z.object({
        channel: z.string().default("community-support"),
        numMessages: z.coerce.number().int().positive().default(100),
      }).safeParse(req.body);

      if (!bodyValidation.success) {
        return res.status(400).json({ error: "Invalid request body", details: bodyValidation.error });
      }

      const { channel, numMessages } = bodyValidation.data;

      logger.info(`Starting scrape of ${channel} channel...`);
      const storedCount = await scraper.scrapeAndStoreMessages(channel, numMessages);

      res.json({
        success: true,
        channel,
        requestedMessages: numMessages,
        storedMessages: storedCount,
        message: `Successfully scraped and stored ${storedCount} new messages from ${channel}`
      });
    } catch (error: any) {
      logger.error("Error during scraping:", error);
      res.status(500).json({ error: "Failed to scrape messages", details: error.message });
    }
  });

  // ==================== ANALYZER ENDPOINT ====================

  router.post("/analyze", adminAuth, async (req: Request, res: Response) => {
    try {
      const analyzer = createAnalyzerFromEnv();

      if (!analyzer) {
        return res.status(500).json({
          error: "Gemini analyzer not configured. Please set GEMINI_API_KEY environment variable."
        });
      }

      const bodyValidation = z.object({
        limit: z.coerce.number().int().positive().default(10),
      }).safeParse(req.body);

      if (!bodyValidation.success) {
        return res.status(400).json({ error: "Invalid request body", details: bodyValidation.error });
      }

      const { limit } = bodyValidation.data;

      logger.info(`Starting analysis of up to ${limit} unanalyzed messages...`);
      const results = await analyzer.analyzeUnanalyzedMessages(limit);

      res.json({
        success: true,
        ...results,
        message: `Analyzed ${results.analyzed} messages. Found ${results.relevant} relevant updates. Created ${results.updatesCreated} pending updates.`
      });
    } catch (error: any) {
      logger.error("Error during analysis:", error);
      res.status(500).json({ error: "Failed to analyze messages", details: error.message });
    }
  });

  // ==================== TRIGGER JOB ENDPOINT ====================

  router.post("/trigger-job", adminAuth, async (req: Request, res: Response) => {
    try {
      const bodyValidation = z.object({
        scrapeLimit: z.coerce.number().int().positive().default(100),
        analysisLimit: z.coerce.number().int().positive().default(50),
        channelName: z.string().default("community-support"),
      }).safeParse(req.body);

      if (!bodyValidation.success) {
        return res.status(400).json({ error: "Invalid request body", details: bodyValidation.error });
      }

      const { scrapeLimit, analysisLimit, channelName } = bodyValidation.data;

      logger.info("Manually triggering scheduled job...");

      // Run the job in the background
      triggerJobManually({
        enabled: true,
        cronSchedule: "",
        scrapeLimit,
        analysisLimit,
        channelName,
      }).catch(error => {
        logger.error("Error in manually triggered job:", error);
      });

      res.json({
        success: true,
        message: "Scheduled job triggered. Check server logs for progress.",
        config: { scrapeLimit, analysisLimit, channelName }
      });
    } catch (error: any) {
      logger.error("Error triggering job:", error);
      res.status(500).json({ error: "Failed to trigger job", details: error.message });
    }
  });

  // ==================== LLM CACHE ADMIN ROUTES ====================

  // Get LLM cache statistics
  router.get("/llm-cache/stats", adminAuth, async (req: Request, res: Response) => {
    try {
      const stats = llmCache.getStats();
      res.json(stats);
    } catch (error: any) {
      logger.error('Error getting LLM cache stats:', error);
      res.status(500).json({ error: "Failed to get cache stats", details: error.message });
    }
  });

  // List all cached LLM requests
  router.get("/llm-cache", adminAuth, async (req: Request, res: Response) => {
    try {
      const allCached = llmCache.listAll();
      res.json(allCached);
    } catch (error: any) {
      logger.error('Error listing LLM cache:', error);
      res.status(500).json({ error: "Failed to list cache", details: error.message });
    }
  });

  // List cached LLM requests by purpose
  router.get("/llm-cache/:purpose", adminAuth, async (req: Request, res: Response) => {
    try {
      const { purpose } = req.params;
      const validPurposes = ['index', 'embeddings', 'analysis', 'changegeneration', 'general'];

      if (!validPurposes.includes(purpose)) {
        return res.status(400).json({ error: `Invalid purpose. Must be one of: ${validPurposes.join(', ')}` });
      }

      const cached = llmCache.listByPurpose(purpose as any);
      res.json({ purpose, count: cached.length, requests: cached });
    } catch (error: any) {
      logger.error('Error listing LLM cache by purpose:', error);
      res.status(500).json({ error: "Failed to list cache by purpose", details: error.message });
    }
  });

  // Clear cached LLM requests by purpose
  router.delete("/llm-cache/:purpose", adminAuth, async (req: Request, res: Response) => {
    try {
      const { purpose } = req.params;
      const validPurposes = ['index', 'embeddings', 'analysis', 'changegeneration', 'general'];

      if (!validPurposes.includes(purpose)) {
        return res.status(400).json({ error: `Invalid purpose. Must be one of: ${validPurposes.join(', ')}` });
      }

      const deletedCount = llmCache.clearPurpose(purpose as any);
      res.json({ success: true, purpose, deletedCount });
    } catch (error: any) {
      logger.error('Error clearing LLM cache by purpose:', error);
      res.status(500).json({ error: "Failed to clear cache by purpose", details: error.message });
    }
  });

  // Clear all cached LLM requests
  router.delete("/llm-cache", adminAuth, async (req: Request, res: Response) => {
    try {
      const deletedCount = llmCache.clearAll();
      res.json({ success: true, deletedCount });
    } catch (error: any) {
      logger.error('Error clearing all LLM cache:', error);
      res.status(500).json({ error: "Failed to clear all cache", details: error.message });
    }
  });

  // Clear cached LLM requests older than specified days
  router.delete("/llm-cache/cleanup/:days", adminAuth, async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.params.days);
      if (isNaN(days) || days < 1) {
        return res.status(400).json({ error: "Days must be a positive integer" });
      }

      const deletedCount = llmCache.clearOlderThan(days);
      res.json({ success: true, days, deletedCount });
    } catch (error: any) {
      logger.error('Error cleaning up LLM cache:', error);
      res.status(500).json({ error: "Failed to cleanup cache", details: error.message });
    }
  });

  return router;
}

export default createAdminPanelRoutes;
