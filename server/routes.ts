import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { createZulipchatScraperFromEnv } from "./scraper/zulipchat";
import { createAnalyzerFromEnv } from "./analyzer/gemini-analyzer";
import { triggerJobManually } from "./scheduler";

// Admin authentication middleware
const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminToken = process.env.ADMIN_TOKEN;
  
  if (!adminToken) {
    console.error("FATAL: ADMIN_TOKEN environment variable is not set");
    return res.status(500).json({ error: "Server configuration error" });
  }
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }
  
  const token = authHeader.substring(7);
  if (token !== adminToken) {
    return res.status(403).json({ error: "Forbidden: Invalid admin token" });
  }
  
  next();
};

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

const sectionIdSchema = z.object({
  sectionId: z.string().min(1),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Documentation routes (public)
  app.get("/api/docs", async (req, res) => {
    try {
      const sections = await storage.getDocumentationSections();
      res.json(sections);
    } catch (error) {
      console.error("Error fetching documentation:", error);
      res.status(500).json({ error: "Failed to fetch documentation" });
    }
  });

  app.get("/api/docs/:sectionId", async (req, res) => {
    try {
      const validation = sectionIdSchema.safeParse(req.params);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid section ID" });
      }
      
      const section = await storage.getDocumentationSection(validation.data.sectionId);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }
      res.json(section);
    } catch (error) {
      console.error("Error fetching section:", error);
      res.status(500).json({ error: "Failed to fetch section" });
    }
  });

  // Pending updates routes (admin only)
  app.get("/api/updates", adminAuth, async (req, res) => {
    try {
      const updates = await storage.getPendingUpdates();
      res.json(updates);
    } catch (error) {
      console.error("Error fetching updates:", error);
      res.status(500).json({ error: "Failed to fetch updates" });
    }
  });

  app.post("/api/updates/:id/approve", adminAuth, async (req, res) => {
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
      console.error("Error approving update:", error);
      if (error.message === "Update not found" || error.message === "Documentation section not found") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === "Cannot approve update: status must be pending") {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to approve update" });
    }
  });

  app.patch("/api/updates/:id", adminAuth, async (req, res) => {
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
      console.error("Error updating pending update:", error);
      res.status(500).json({ error: "Failed to update pending update" });
    }
  });

  app.post("/api/updates/:id/reject", adminAuth, async (req, res) => {
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
      console.error("Error rejecting update:", error);
      if (error.message === "Update not found") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === "Cannot reject update: status must be pending") {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to reject update" });
    }
  });

  // Update history route (admin only)
  app.get("/api/history", adminAuth, async (req, res) => {
    try {
      const history = await storage.getUpdateHistory();
      res.json(history);
    } catch (error) {
      console.error("Error fetching history:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // Scraped messages routes (admin only)
  app.get("/api/messages", adminAuth, async (req, res) => {
    try {
      const messages = await storage.getScrapedMessages();
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/messages/unanalyzed", adminAuth, async (req, res) => {
    try {
      const messages = await storage.getUnanalyzedMessages();
      res.json(messages);
    } catch (error) {
      console.error("Error fetching unanalyzed messages:", error);
      res.status(500).json({ error: "Failed to fetch unanalyzed messages" });
    }
  });

  // Scraper endpoint (admin only)
  app.post("/api/scrape", adminAuth, async (req, res) => {
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
      
      console.log(`Starting scrape of ${channel} channel...`);
      const storedCount = await scraper.scrapeAndStoreMessages(channel, numMessages);
      
      res.json({ 
        success: true, 
        channel, 
        requestedMessages: numMessages,
        storedMessages: storedCount,
        message: `Successfully scraped and stored ${storedCount} new messages from ${channel}` 
      });
    } catch (error: any) {
      console.error("Error during scraping:", error);
      res.status(500).json({ error: "Failed to scrape messages", details: error.message });
    }
  });

  // Analyzer endpoint (admin only)
  app.post("/api/analyze", adminAuth, async (req, res) => {
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
      
      console.log(`Starting analysis of up to ${limit} unanalyzed messages...`);
      const results = await analyzer.analyzeUnanalyzedMessages(limit);
      
      res.json({ 
        success: true,
        ...results,
        message: `Analyzed ${results.analyzed} messages. Found ${results.relevant} relevant updates. Created ${results.updatesCreated} pending updates.`
      });
    } catch (error: any) {
      console.error("Error during analysis:", error);
      res.status(500).json({ error: "Failed to analyze messages", details: error.message });
    }
  });

  // POST /api/trigger-job - Manually trigger the scheduled job
  app.post("/api/trigger-job", adminAuth, async (req, res) => {
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
      
      console.log(`Manually triggering scheduled job...`);
      
      // Run the job in the background
      triggerJobManually({
        enabled: true,
        cronSchedule: "",
        scrapeLimit,
        analysisLimit,
        channelName,
      }).catch(error => {
        console.error("Error in manually triggered job:", error);
      });
      
      res.json({ 
        success: true,
        message: "Scheduled job triggered. Check server logs for progress.",
        config: { scrapeLimit, analysisLimit, channelName }
      });
    } catch (error: any) {
      console.error("Error triggering job:", error);
      res.status(500).json({ error: "Failed to trigger job", details: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
