import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";

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

  const httpServer = createServer(app);

  return httpServer;
}
