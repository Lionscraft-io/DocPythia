/**
 * Quality System Routes
 *
 * API endpoints for managing prompts, rulesets, and feedback
 * Phase 1: Prompts Overview (read-only) and basic Ruleset Editor
 *
 * @author Wayne
 * @created 2026-01-19
 */

import { Router, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { createPromptRegistry } from '../pipeline/prompts/PromptRegistry.js';
import { createLogger, getErrorMessage } from '../utils/logger.js';
import path from 'path';

const logger = createLogger('QualitySystemRoutes');

/**
 * Get instance ID from request
 * Checks both instance middleware (for /:instance routes) and admin auth (for non-instance routes)
 */
function getInstanceId(req: Request): string | undefined {
  // First try: Instance middleware (for routes with /:instance prefix)
  if ((req as any).instance?.id) {
    return (req as any).instance.id;
  }

  // Second try: Admin auth middleware (for routes without /:instance prefix)
  const adminInstance = (req as any).adminInstance;
  if (adminInstance) {
    return adminInstance;
  }

  return undefined;
}

// Validation schemas
const rulesetContentSchema = z.object({
  content: z.string().min(1, 'Ruleset content cannot be empty'),
});

const feedbackSchema = z.object({
  proposalId: z.number().optional(),
  actionTaken: z.enum(['approve', 'reject', 'edit']),
  feedbackText: z.string().min(1, 'Feedback text cannot be empty'),
});

/**
 * Create Quality System routes
 */
export function createQualitySystemRoutes(adminAuth: RequestHandler): Router {
  const router = Router();

  // ==================== PROMPTS ROUTES (Read-only) ====================

  /**
   * GET /prompts
   * List all available prompts from the registry
   */
  router.get('/prompts', adminAuth, async (req: Request, res: Response) => {
    try {
      // Get instance ID from request headers (set by multi-instance middleware)
      const instanceId = getInstanceId(req) || undefined;

      // Create and load prompt registry
      const configBasePath = path.join(process.cwd(), 'config');
      const registry = createPromptRegistry(configBasePath, instanceId);
      await registry.load();

      const prompts = registry.list();

      // Return prompts with validation info
      const promptsWithValidation = prompts.map((prompt) => ({
        ...prompt,
        validation: registry.validate(prompt),
      }));

      res.json({
        instanceId: instanceId || 'default',
        count: prompts.length,
        prompts: promptsWithValidation,
      });
    } catch (error) {
      logger.error('Error fetching prompts:', error);
      res.status(500).json({ error: 'Failed to fetch prompts', details: getErrorMessage(error) });
    }
  });

  /**
   * GET /prompts/:promptId
   * Get a specific prompt by ID with full content
   */
  router.get('/prompts/:promptId', adminAuth, async (req: Request, res: Response) => {
    try {
      const { promptId } = req.params;
      const instanceId = getInstanceId(req) || undefined;

      const configBasePath = path.join(process.cwd(), 'config');
      const registry = createPromptRegistry(configBasePath, instanceId);
      await registry.load();

      const prompt = registry.get(promptId);

      if (!prompt) {
        return res.status(404).json({ error: `Prompt not found: ${promptId}` });
      }

      res.json({
        instanceId: instanceId || 'default',
        prompt,
        validation: registry.validate(prompt),
      });
    } catch (error) {
      logger.error('Error fetching prompt:', error);
      res.status(500).json({ error: 'Failed to fetch prompt', details: getErrorMessage(error) });
    }
  });

  // ==================== RULESETS ROUTES ====================

  /**
   * GET /rulesets
   * List all tenant rulesets (or just the current tenant's for instance-specific requests)
   */
  router.get('/rulesets', adminAuth, async (req: Request, res: Response) => {
    try {
      const instanceId = getInstanceId(req) || undefined;

      // If instance-specific, filter to that tenant only
      const where = instanceId ? { tenantId: instanceId } : {};

      const rulesets = await db.tenantRuleset.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
      });

      res.json({
        instanceId: instanceId || 'all',
        count: rulesets.length,
        rulesets,
      });
    } catch (error) {
      logger.error('Error fetching rulesets:', error);
      res.status(500).json({ error: 'Failed to fetch rulesets', details: getErrorMessage(error) });
    }
  });

  /**
   * GET /rulesets/:tenantId
   * Get a specific tenant's ruleset
   */
  router.get('/rulesets/:tenantId', adminAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      const ruleset = await db.tenantRuleset.findUnique({
        where: { tenantId },
      });

      if (!ruleset) {
        return res.status(404).json({ error: `Ruleset not found for tenant: ${tenantId}` });
      }

      res.json(ruleset);
    } catch (error) {
      logger.error('Error fetching ruleset:', error);
      res.status(500).json({ error: 'Failed to fetch ruleset', details: getErrorMessage(error) });
    }
  });

  /**
   * PUT /rulesets/:tenantId
   * Create or update a tenant's ruleset
   */
  router.put('/rulesets/:tenantId', adminAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      const validation = rulesetContentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const { content } = validation.data;

      // Upsert the ruleset
      const ruleset = await db.tenantRuleset.upsert({
        where: { tenantId },
        update: { content, updatedAt: new Date() },
        create: { tenantId, content },
      });

      logger.info(`Ruleset updated for tenant: ${tenantId}`);
      res.json(ruleset);
    } catch (error) {
      logger.error('Error updating ruleset:', error);
      res.status(500).json({ error: 'Failed to update ruleset', details: getErrorMessage(error) });
    }
  });

  /**
   * DELETE /rulesets/:tenantId
   * Delete a tenant's ruleset
   */
  router.delete('/rulesets/:tenantId', adminAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      const existing = await db.tenantRuleset.findUnique({
        where: { tenantId },
      });

      if (!existing) {
        return res.status(404).json({ error: `Ruleset not found for tenant: ${tenantId}` });
      }

      await db.tenantRuleset.delete({
        where: { tenantId },
      });

      logger.info(`Ruleset deleted for tenant: ${tenantId}`);
      res.json({ success: true, message: `Ruleset deleted for tenant: ${tenantId}` });
    } catch (error) {
      logger.error('Error deleting ruleset:', error);
      res.status(500).json({ error: 'Failed to delete ruleset', details: getErrorMessage(error) });
    }
  });

  // ==================== FEEDBACK ROUTES ====================

  /**
   * POST /feedback
   * Submit feedback on a proposal review
   */
  router.post('/feedback', adminAuth, async (req: Request, res: Response) => {
    try {
      const instanceId = getInstanceId(req);

      if (!instanceId) {
        return res.status(400).json({ error: 'Instance ID required for feedback submission' });
      }

      const validation = feedbackSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const { proposalId, actionTaken, feedbackText } = validation.data;

      // Ensure tenant ruleset exists (create empty if not)
      await db.tenantRuleset.upsert({
        where: { tenantId: instanceId },
        update: {},
        create: { tenantId: instanceId, content: '' },
      });

      const feedback = await db.rulesetFeedback.create({
        data: {
          tenantId: instanceId,
          proposalId,
          actionTaken,
          feedbackText,
        },
      });

      logger.info(`Feedback submitted for tenant ${instanceId}, action: ${actionTaken}`);
      res.json(feedback);
    } catch (error) {
      logger.error('Error submitting feedback:', error);
      res.status(500).json({ error: 'Failed to submit feedback', details: getErrorMessage(error) });
    }
  });

  /**
   * GET /feedback
   * Get all feedback for the current tenant
   */
  router.get('/feedback', adminAuth, async (req: Request, res: Response) => {
    try {
      const instanceId = getInstanceId(req) || undefined;

      const where = instanceId ? { tenantId: instanceId } : {};

      const feedback = await db.rulesetFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          proposal: {
            select: {
              id: true,
              page: true,
              section: true,
              updateType: true,
            },
          },
        },
      });

      res.json({
        instanceId: instanceId || 'all',
        count: feedback.length,
        feedback,
      });
    } catch (error) {
      logger.error('Error fetching feedback:', error);
      res.status(500).json({ error: 'Failed to fetch feedback', details: getErrorMessage(error) });
    }
  });

  return router;
}

export default createQualitySystemRoutes;
