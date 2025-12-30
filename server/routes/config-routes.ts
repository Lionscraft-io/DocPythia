import { Router, Request, Response } from 'express';
import { getConfig } from '../config/loader';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ConfigRoutes');
const router = Router();

// Public configuration endpoint (instance-aware)
router.get('/', async (req: Request, res: Response) => {
  try {
    let config;

    // Try to detect instance from Referer header (e.g., https://domain.com/projecta/admin)
    const referer = req.get('Referer') || req.get('Referrer');
    let instanceId: string | undefined;

    if (referer) {
      // Extract instance from URL path (e.g., /instance-name/admin)
      // Accepts any instance name pattern (alphanumeric with dashes)
      const match = referer.match(/\/([a-z0-9-]+)\/(?:admin|api|widget)/i);
      if (match) {
        instanceId = match[1].toLowerCase();
        logger.debug(`Detected instance "${instanceId}" from Referer: ${referer}`);
      }
    }

    // Also check query parameter
    if (!instanceId && req.query.instance) {
      instanceId = String(req.query.instance).toLowerCase();
      logger.debug(`Using instance "${instanceId}" from query param`);
    }

    // Load instance-specific config or fall back to default
    if (instanceId) {
      try {
        const { InstanceConfigLoader } = await import('../config/instance-loader.js');
        config = InstanceConfigLoader.get(instanceId);
        logger.debug(`Loaded config for instance "${instanceId}"`);
      } catch {
        logger.warn(`Instance "${instanceId}" not found, falling back to default`);
        config = getConfig();
      }
    } else {
      config = getConfig();
      logger.debug('No instance detected, using default config');
    }

    // Return safe subset (no secrets)
    res.json({
      project: config.project,
      branding: config.branding,
      widget: {
        enabled: config.widget.enabled,
        title: config.widget.title,
        welcomeMessage: config.widget.welcomeMessage,
        suggestedQuestions: config.widget.suggestedQuestions,
        position: config.widget.position,
        theme: config.widget.theme,
        primaryColor: config.widget.primaryColor,
      },
      features: {
        chatEnabled: config.features.chatEnabled,
        versionHistoryEnabled: config.features.versionHistoryEnabled,
      },
      repository: {
        targetRepo: process.env.DEFAULT_TARGET_REPO || '',
        sourceRepo: process.env.DEFAULT_TARGET_REPO || '', // Same as targetRepo for API compatibility
        baseBranch: process.env.DEFAULT_BASE_BRANCH || 'main',
      },
    });
  } catch (error) {
    logger.error('Error fetching config:', error);
    res.status(500).json({
      error: 'Failed to load configuration',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
