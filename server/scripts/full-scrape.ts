#!/usr/bin/env tsx
/**
 * Full Scrape Script
 * 
 * Performs a one-time full scrape of all historical messages from Zulipchat.
 * This should be run once initially, then the daily scheduler will do incremental scrapes.
 * 
 * Usage:
 *   npx tsx server/scripts/full-scrape.ts [channel-name] [batch-size]
 * 
 * Example:
 *   npx tsx server/scripts/full-scrape.ts community-support 1000
 */

import { createZulipchatScraperFromEnv } from "../scraper/zulipchat";

async function main() {
  const channelName = process.argv[2] || process.env.ZULIP_CHANNEL || "community-support";
  const batchSize = parseInt(process.argv[3] || "1000", 10);

  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║   NEAR Validator Docs - Full Scrape     ║");
  console.log("╚═══════════════════════════════════════════╝\n");
  console.log(`Channel: ${channelName}`);
  console.log(`Batch Size: ${batchSize} messages per batch\n`);

  const scraper = createZulipchatScraperFromEnv();

  if (!scraper) {
    console.error("❌ Error: Zulipchat credentials not configured");
    console.error("   Please set ZULIP_BOT_EMAIL and ZULIP_API_KEY environment variables");
    process.exit(1);
  }

  console.log("Testing connection to Zulipchat...");
  const connected = await scraper.testConnection();

  if (!connected) {
    console.error("❌ Error: Could not connect to Zulipchat");
    console.error("   Please check your credentials and network connection");
    process.exit(1);
  }

  console.log("✓ Successfully connected to Zulipchat\n");

  try {
    const totalMessages = await scraper.performFullScrape(channelName, batchSize);

    console.log("\n╔═══════════════════════════════════════════╗");
    console.log(`║   Full Scrape Complete!                  ║`);
    console.log("╚═══════════════════════════════════════════╝");
    console.log(`\nTotal messages stored: ${totalMessages}`);
    console.log("\nNext steps:");
    console.log("1. Run AI analysis: npx tsx server/scripts/analyze-messages.ts");
    console.log("2. Enable scheduler: Set SCHEDULER_ENABLED=true in environment");
    console.log("3. Daily incremental scrapes will now fetch only new messages\n");
  } catch (error: any) {
    console.error("\n❌ Full scrape failed:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
