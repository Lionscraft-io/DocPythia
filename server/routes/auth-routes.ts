/**
 * Authentication Routes
 * Smart login that auto-detects instance
 * Author: Wayne (2025-11-13)
 */

import { Router, Request, Response } from 'express';
import { authenticateAnyInstance, authenticateInstance } from '../auth/multi-instance-auth';
import { InstanceConfigLoader } from '../config/instance-loader';

const router = Router();

/**
 * Smart login endpoint - tries password against all instances
 * POST /api/auth/login
 * Body: { password: string }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required'
      });
    }

    // Check if auth is disabled (development only)
    if (process.env.DISABLE_ADMIN_AUTH === 'true') {
      // Return first available instance
      const instances = InstanceConfigLoader.getAvailableInstances();
      return res.json({
        success: true,
        instanceId: instances[0] || 'default',
        message: 'Authentication disabled (development mode)'
      });
    }

    // Try password against all instances
    const result = await authenticateAnyInstance(password);

    if (result.success) {
      return res.json({
        success: true,
        instanceId: result.instanceId,
        redirectUrl: `/${result.instanceId}/admin`
      });
    } else {
      return res.status(401).json({
        success: false,
        error: result.error || 'Invalid password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get available instances (for debugging)
 * GET /api/auth/instances
 */
router.get('/instances', (req: Request, res: Response) => {
  try {
    const instances = InstanceConfigLoader.getAvailableInstances();
    res.json({ instances });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get instances' });
  }
});

/**
 * Verify session for specific instance
 * POST /api/auth/verify
 * Body: { password: string, instanceId: string }
 */
router.post('/verify', (req: Request, res: Response) => {
  try {
    const { password, instanceId } = req.body;

    if (!password || !instanceId) {
      return res.status(400).json({
        success: false,
        error: 'Password and instanceId are required'
      });
    }

    // Check if auth is disabled
    if (process.env.DISABLE_ADMIN_AUTH === 'true') {
      return res.json({ success: true });
    }

    const isValid = authenticateInstance(password, instanceId);

    if (isValid) {
      return res.json({ success: true });
    } else {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
