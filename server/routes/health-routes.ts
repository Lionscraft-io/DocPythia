import { Router, Request, Response } from 'express';
import { storage } from '../storage';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Diagnostic endpoint
router.get('/diagnostics', async (req: Request, res: Response) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'Set' : 'Not set',
      WIDGET_DOMAIN: process.env.WIDGET_DOMAIN,
      PORT: process.env.PORT,
    },
    database: 'Unknown',
    static_files: 'Unknown',
  };

  // Test database connection
  try {
    await storage.getDocumentationSections();
    diagnostics.database = 'Connected';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    diagnostics.database = `Error: ${errorMessage}`;
  }

  // Check static files
  try {
    const fs = await import('fs');
    const path = await import('path');
    const distPath = path.resolve(process.cwd(), 'dist', 'public');
    const exists = fs.existsSync(distPath);
    diagnostics.static_files = exists ? `Found: ${distPath}` : `Missing: ${distPath}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    diagnostics.static_files = `Error: ${errorMessage}`;
  }

  res.json(diagnostics);
});

export default router;
