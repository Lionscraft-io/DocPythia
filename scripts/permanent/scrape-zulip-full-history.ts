#!/usr/bin/env npx tsx
/**
 * Full scrape of Zulip channel - fetches ALL historical messages
 * Usage: npx tsx scripts/permanent/scrape-zulip-full-history.ts [channel] [batchSize]
 */

import { createZulipchatScraperFromEnv } from '../../server/scraper/zulipchat';

async function main() {
  const channel = process.argv[2] || 'community-support';
  const batchSize = parseInt(process.argv[3] || '1000');

  console.log(`🔍 Starting FULL Zulip scrape...`);
  console.log(`   Channel: ${channel}`);
  console.log(`   Batch size: ${batchSize}\n`);

  const scraper = createZulipchatScraperFromEnv();

  if (!scraper) {
    console.error('❌ Zulip scraper not configured.');
    console.error('   Please set ZULIP_BOT_EMAIL and ZULIP_API_KEY in your .env file.\n');
    process.exit(1);
  }

  // Test connection
  console.log('🔌 Testing Zulip connection...');
  const connectionOk = await scraper.testConnection();

  if (!connectionOk) {
    console.error('❌ Failed to connect to Zulip. Please check your credentials.\n');
    process.exit(1);
  }

  console.log('✅ Connection successful!\n');

  // Perform full scrape (fetches all historical messages in batches)
  try {
    const totalStored = await scraper.performFullScrape(channel, batchSize);

    console.log(`\n✅ Full scrape completed!`);
    console.log(`   Total messages stored: ${totalStored}`);
    console.log(
      `\n💡 Run 'npx tsx scripts/permanent/check-zulip-messages.ts' to see statistics.\n`
    );
  } catch (error: any) {
    console.error('❌ Scrape failed:', error.message);
    process.exit(1);
  }
}

main();
