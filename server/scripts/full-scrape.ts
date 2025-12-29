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

import {
  runFullScrape,
  parseFullScrapeArgs,
  formatHeader,
  getProjectName,
} from "./script-logic";

async function main() {
  const options = parseFullScrapeArgs(process.argv, process.env);
  const projectName = getProjectName();

  console.log("\n" + formatHeader(`${projectName} - Full Scrape`) + "\n");
  console.log(`Channel: ${options.channelName}`);
  console.log(`Batch Size: ${options.batchSize} messages per batch\n`);

  const result = await runFullScrape(options);

  if (!result.success) {
    console.error(`❌ Error: ${result.error}`);
    process.exit(1);
  }

  console.log("\n" + formatHeader("Full Scrape Complete!"));
  console.log(`\nTotal messages stored: ${result.totalMessages}`);
  console.log("\nNext steps:");
  console.log("1. Run AI analysis: npx tsx server/scripts/analyze-messages.ts");
  console.log("2. Enable scheduler: Set SCHEDULER_ENABLED=true in environment");
  console.log("3. Daily incremental scrapes will now fetch only new messages\n");
}

main();
