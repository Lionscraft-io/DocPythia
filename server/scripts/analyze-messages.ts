#!/usr/bin/env tsx
/**
 * Analyze Messages Script
 * 
 * Analyzes unanalyzed messages using the AI analyzer.
 * Useful for bulk analysis after a full scrape.
 * 
 * Usage:
 *   npx tsx server/scripts/analyze-messages.ts [limit]
 * 
 * Example:
 *   npx tsx server/scripts/analyze-messages.ts 100
 */

import { createAnalyzerFromEnv } from "../analyzer/gemini-analyzer";
import { storage } from "../storage";

async function main() {
  const limit = parseInt(process.argv[2] || "100", 10);

  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║   NEAR Validator Docs - AI Analysis     ║");
  console.log("╚═══════════════════════════════════════════╝\n");

  const analyzer = createAnalyzerFromEnv();

  if (!analyzer) {
    console.error("❌ Error: Gemini API key not configured");
    console.error("   Please set GEMINI_API_KEY environment variable");
    process.exit(1);
  }

  // Check how many unanalyzed messages we have
  const unanalyzed = await storage.getUnanalyzedMessages();
  console.log(`Found ${unanalyzed.length} unanalyzed messages`);
  console.log(`Analyzing up to ${limit} messages...\n`);

  try {
    const result = await analyzer.analyzeUnanalyzedMessages(limit);

    console.log("\n╔═══════════════════════════════════════════╗");
    console.log(`║   Analysis Complete!                      ║`);
    console.log("╚═══════════════════════════════════════════╝");
    console.log(`\nMessages analyzed: ${result.analyzed}`);
    console.log(`Relevant messages: ${result.relevant}`);
    console.log(`Updates created: ${result.updatesCreated}`);

    const remaining = await storage.getUnanalyzedMessages();
    console.log(`\nUnanalyzed messages remaining: ${remaining.length}`);

    if (remaining.length > 0) {
      console.log("\nTo analyze more messages, run this script again:");
      console.log(`  npx tsx server/scripts/analyze-messages.ts ${limit}\n`);
    }
  } catch (error: any) {
    console.error("\n❌ Analysis failed:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
