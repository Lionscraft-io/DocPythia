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

const rollbackBodySchema = z.object({
  versionId: z.string().uuid(),
  performedBy: z.string().optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Diagnostic endpoint
  app.get("/api/diagnostics", async (req, res) => {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? "Set" : "Not set",
        WIDGET_DOMAIN: process.env.WIDGET_DOMAIN,
        PORT: process.env.PORT
      },
      database: "Unknown",
      static_files: "Unknown"
    };

    // Test database connection
    try {
      await storage.getDocumentationSections();
      diagnostics.database = "Connected";
    } catch (error) {
      diagnostics.database = `Error: ${error.message}`;
    }

    // Check static files
    try {
      const fs = await import("fs");
      const path = await import("path");
      const distPath = path.resolve(process.cwd(), "dist", "public");
      const exists = fs.existsSync(distPath);
      diagnostics.static_files = exists ? `Found: ${distPath}` : `Missing: ${distPath}`;
    } catch (error) {
      diagnostics.static_files = `Error: ${error.message}`;
    }

    res.json(diagnostics);
  });

  // Widget API endpoints
  app.get("/widget/:expertId", (req, res) => {
    const { expertId } = req.params;
    const { theme = 'light', embedded = 'false' } = req.query;
    const domain = process.env.WIDGET_DOMAIN || 'https://experthub.lionscraft.io';

    const widgetHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Assistant Widget</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        body {
            background: ${theme === 'dark' ? '#1a1a1a' : '#ffffff'};
            color: ${theme === 'dark' ? '#ffffff' : '#333333'};
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .widget-header {
            padding: 16px;
            border-bottom: 1px solid ${theme === 'dark' ? '#333' : '#e5e5e5'};
            background: ${theme === 'dark' ? '#2a2a2a' : '#f8f9fa'};
        }

        .widget-title {
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .widget-content {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
        }

        .chat-container {
            max-width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px 0;
        }

        .message {
            margin-bottom: 16px;
            padding: 12px 16px;
            border-radius: 12px;
            max-width: 80%;
        }

        .message.user {
            background: #007bff;
            color: white;
            margin-left: auto;
        }

        .message.assistant {
            background: ${theme === 'dark' ? '#333' : '#f1f3f4'};
            color: ${theme === 'dark' ? '#fff' : '#333'};
        }

        .input-container {
            display: flex;
            gap: 8px;
            padding: 16px;
            border-top: 1px solid ${theme === 'dark' ? '#333' : '#e5e5e5'};
        }

        .chat-input {
            flex: 1;
            padding: 12px;
            border: 1px solid ${theme === 'dark' ? '#444' : '#ddd'};
            border-radius: 8px;
            background: ${theme === 'dark' ? '#333' : '#fff'};
            color: ${theme === 'dark' ? '#fff' : '#333'};
        }

        .send-button {
            padding: 12px 16px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
        }

        .send-button:hover {
            background: #0056b3;
        }

        .suggested-questions {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 16px;
        }

        .suggestion-button {
            padding: 8px 12px;
            background: ${theme === 'dark' ? '#444' : '#f8f9fa'};
            border: 1px solid ${theme === 'dark' ? '#555' : '#e5e5e5'};
            border-radius: 8px;
            cursor: pointer;
            text-align: left;
            transition: background-color 0.2s;
        }

        .suggestion-button:hover {
            background: ${theme === 'dark' ? '#555' : '#e9ecef'};
        }
    </style>
</head>
<body>
    <div class="widget-header">
        <div class="widget-title">
            <span>🤖</span>
            <span>NearDocs AI Assistant</span>
        </div>
    </div>

    <div class="widget-content">
        <div class="chat-container">
            <div class="messages" id="messages">
                <div class="message assistant">
                    Hello! I'm your NEAR Protocol documentation assistant. How can I help you today?
                </div>

                <div class="suggested-questions">
                    <button class="suggestion-button" onclick="askQuestion('How do I set up a NEAR validator node?')">
                        How do I set up a NEAR validator node?
                    </button>
                    <button class="suggestion-button" onclick="askQuestion('What are the hardware requirements for running a node?')">
                        What are the hardware requirements for running a node?
                    </button>
                    <button class="suggestion-button" onclick="askQuestion('How do I monitor my node performance?')">
                        How do I monitor my node performance?
                    </button>
                </div>
            </div>

            <div class="input-container">
                <input
                    type="text"
                    class="chat-input"
                    placeholder="Ask me anything about NEAR Protocol..."
                    id="chatInput"
                    onkeypress="handleKeyPress(event)"
                />
                <button class="send-button" onclick="sendMessage()">
                    Send
                </button>
            </div>
        </div>
    </div>

    <script>
        function askQuestion(question) {
            const input = document.getElementById('chatInput');
            input.value = question;
            sendMessage();
        }

        function handleKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }

        function sendMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();

            if (!message) return;

            // Add user message
            addMessage(message, 'user');
            input.value = '';

            // Simulate AI response (replace with actual API call)
            setTimeout(() => {
                addMessage('I\\'m processing your question about NEAR Protocol. This is a demo response.', 'assistant');
            }, 1000);
        }

        function addMessage(text, sender) {
            const messagesContainer = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${sender}\`;
            messageDiv.textContent = text;
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            // Remove suggested questions after first user message
            if (sender === 'user') {
                const suggestions = messagesContainer.querySelector('.suggested-questions');
                if (suggestions) {
                    suggestions.remove();
                }
            }
        }

        // Notify parent window if embedded
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'WIDGET_LOADED',
                expertId: '${expertId}'
            }, '*');
        }
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(widgetHtml);
  });

  // Widget JavaScript library
  app.get("/widget.js", (req, res) => {
    const domain = process.env.WIDGET_DOMAIN || 'https://experthub.lionscraft.io';

    const widgetJs = `
(function() {
    'use strict';

    window.NearDocsWidget = {
        init: function(options) {
            const config = {
                expertId: options.expertId || 'default',
                theme: options.theme || 'light',
                position: options.position || 'bottom-right',
                title: options.title || 'NearDocs AI',
                domain: '${domain}',
                ...options
            };

            this.createWidget(config);
        },

        createWidget: function(config) {
            // Create widget container
            const widgetContainer = document.createElement('div');
            widgetContainer.id = 'neardocs-widget-container';
            widgetContainer.style.cssText = \`
                position: fixed;
                z-index: 10000;
                \${this.getPositionStyles(config.position)}
            \`;

            // Create toggle button
            const toggleButton = document.createElement('button');
            toggleButton.id = 'neardocs-widget-toggle';
            toggleButton.innerHTML = '💬';
            toggleButton.style.cssText = \`
                width: 60px;
                height: 60px;
                border-radius: 50%;
                border: none;
                background: #007bff;
                color: white;
                cursor: pointer;
                font-size: 24px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                transition: all 0.3s ease;
            \`;

            // Create widget iframe
            const widgetFrame = document.createElement('iframe');
            widgetFrame.id = 'neardocs-widget-frame';
            widgetFrame.src = \`\${config.domain}/widget/\${config.expertId}?theme=\${config.theme}&embedded=true\`;
            widgetFrame.style.cssText = \`
                width: 350px;
                height: 500px;
                border: none;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                display: none;
                margin-bottom: 16px;
                background: white;
            \`;

            let isOpen = false;

            toggleButton.addEventListener('click', function() {
                isOpen = !isOpen;
                widgetFrame.style.display = isOpen ? 'block' : 'none';
                toggleButton.innerHTML = isOpen ? '✕' : '💬';
            });

            // Add to DOM
            widgetContainer.appendChild(widgetFrame);
            widgetContainer.appendChild(toggleButton);
            document.body.appendChild(widgetContainer);

            // Handle messages from iframe
            window.addEventListener('message', function(event) {
                if (event.origin !== config.domain) return;

                if (event.data.type === 'WIDGET_CLOSE') {
                    isOpen = false;
                    widgetFrame.style.display = 'none';
                    toggleButton.innerHTML = '💬';
                }
            });
        },

        getPositionStyles: function(position) {
            const styles = {
                'bottom-right': 'bottom: 20px; right: 20px;',
                'bottom-left': 'bottom: 20px; left: 20px;',
                'top-right': 'top: 20px; right: 20px;',
                'top-left': 'top: 20px; left: 20px;'
            };
            return styles[position] || styles['bottom-right'];
        }
    };

    // Auto-init if data attributes are present
    document.addEventListener('DOMContentLoaded', function() {
        const autoInit = document.querySelector('[data-neardocs-widget]');
        if (autoInit) {
            const config = {
                expertId: autoInit.getAttribute('data-expert-id') || 'default',
                theme: autoInit.getAttribute('data-theme') || 'light',
                position: autoInit.getAttribute('data-position') || 'bottom-right',
                title: autoInit.getAttribute('data-title') || 'NearDocs AI'
            };
            window.NearDocsWidget.init(config);
        }
    });
})();`;

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(widgetJs);
  });

  // Widget demo page
  app.get("/widget-demo", (req, res) => {
    const domain = process.env.WIDGET_DOMAIN || 'https://experthub.lionscraft.io';

    const demoHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NearDocs Widget Demo</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: #f8f9fa;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-bottom: 30px; }
        h2 { color: #555; margin-top: 30px; }
        code {
            background: #f1f3f4;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
        }
        .code-block {
            background: #1a1a1a;
            color: #e1e1e1;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 16px 0;
        }
        .demo-button {
            background: #007bff;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin: 8px 8px 8px 0;
        }
        .demo-button:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 NearDocs AI Widget Demo</h1>

        <p>This page demonstrates the NearDocs AI widget integration. The widget provides AI-powered assistance for NEAR Protocol documentation and can be easily embedded on any website.</p>

        <h2>🚀 Quick Start</h2>
        <p>Add this script to your website to enable the widget:</p>

        <div class="code-block">
&lt;script src="${domain}/widget.js"&gt;&lt;/script&gt;
&lt;div data-neardocs-widget data-expert-id="default" data-theme="light"&gt;&lt;/div&gt;
        </div>

        <h2>📋 Manual Integration</h2>
        <div class="code-block">
&lt;script src="${domain}/widget.js"&gt;&lt;/script&gt;
&lt;script&gt;
  NearDocsWidget.init({
    expertId: 'default',
    theme: 'light',
    position: 'bottom-right',
    title: 'NEAR Help'
  });
&lt;/script&gt;
        </div>

        <h2>🎨 Demo Controls</h2>
        <button class="demo-button" onclick="initWidget('default', 'light', 'bottom-right')">
            Light Theme (Bottom Right)
        </button>
        <button class="demo-button" onclick="initWidget('default', 'dark', 'bottom-left')">
            Dark Theme (Bottom Left)
        </button>
        <button class="demo-button" onclick="initWidget('default', 'light', 'top-right')">
            Top Right Position
        </button>
        <button class="demo-button" onclick="removeWidget()">
            Remove Widget
        </button>

        <h2>⚙️ Configuration Options</h2>
        <ul>
            <li><code>expertId</code> - The expert/assistant ID (default: 'default')</li>
            <li><code>theme</code> - 'light' or 'dark' (default: 'light')</li>
            <li><code>position</code> - 'bottom-right', 'bottom-left', 'top-right', 'top-left'</li>
            <li><code>title</code> - Widget title (default: 'NearDocs AI')</li>
        </ul>

        <h2>🔗 Direct Widget URL</h2>
        <p>You can also embed the widget directly using an iframe:</p>
        <div class="code-block">
&lt;iframe
  src="${domain}/widget/default?theme=light&embedded=true"
  width="350"
  height="500"
  frameborder="0"
&gt;&lt;/iframe&gt;
        </div>

        <h2>🛡️ Security</h2>
        <p>The widget is designed with security in mind:</p>
        <ul>
            <li>Sandboxed iframe environment</li>
            <li>CORS protection</li>
            <li>Content Security Policy headers</li>
            <li>No access to parent page data</li>
        </ul>
    </div>

    <script src="${domain}/widget.js"></script>
    <script>
        function initWidget(expertId, theme, position) {
            removeWidget();
            setTimeout(() => {
                window.NearDocsWidget.init({
                    expertId: expertId,
                    theme: theme,
                    position: position,
                    title: 'NEAR Help Demo'
                });
            }, 100);
        }

        function removeWidget() {
            const existing = document.getElementById('neardocs-widget-container');
            if (existing) {
                existing.remove();
            }
        }

        // Initialize with default settings
        document.addEventListener('DOMContentLoaded', function() {
            initWidget('default', 'light', 'bottom-right');
        });
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(demoHtml);
  });

  // Documentation routes (public)
  app.get("/api/docs", async (req, res) => {
    try {
      // Check if DATABASE_URL is set
      if (!process.env.DATABASE_URL) {
        return res.status(500).json({
          error: "Database not configured",
          message: "DATABASE_URL environment variable is not set"
        });
      }

      const sections = await storage.getDocumentationSections();
      res.json(sections);
    } catch (error) {
      console.error("Error fetching documentation:", error);

      // Provide more specific error messages
      let errorMessage = "Failed to fetch documentation";
      if (error.message.includes("connect")) {
        errorMessage = "Database connection failed";
      } else if (error.message.includes("relation") || error.message.includes("table")) {
        errorMessage = "Database tables not found - run migrations";
      }

      res.status(500).json({
        error: errorMessage,
        details: error.message
      });
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

  // Section version history routes (admin only)
  app.get("/api/sections/:sectionId/history", adminAuth, async (req, res) => {
    try {
      const validation = sectionIdSchema.safeParse(req.params);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid section ID" });
      }
      
      const history = await storage.getSectionHistory(validation.data.sectionId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching section history:", error);
      res.status(500).json({ error: "Failed to fetch section history" });
    }
  });

  app.post("/api/sections/:sectionId/rollback", adminAuth, async (req, res) => {
    try {
      const paramsValidation = sectionIdSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        return res.status(400).json({ error: "Invalid section ID" });
      }
      
      const bodyValidation = rollbackBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({ error: "Invalid request body" });
      }
      
      const result = await storage.rollbackSection(
        paramsValidation.data.sectionId,
        bodyValidation.data.versionId,
        bodyValidation.data.performedBy
      );
      
      res.json(result);
    } catch (error: any) {
      console.error("Error rolling back section:", error);
      if (error.message === "Version not found") {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === "Version does not belong to this section") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to rollback section" });
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
