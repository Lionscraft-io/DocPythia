#!/usr/bin/env npx tsx
/**
 * Manually scrape Zulip messages
 * Usage: npx tsx scripts/permanent/scrape-zulip-manual.ts [channel] [numMessages]
 */

import { createZulipchatScraperFromEnv } from '../../server/scraper/zulipchat';

async function main() {
  const channel = process.argv[2] || 'community-support';
  const numMessages = parseInt(process.argv[3] || '100');

  console.log(`🔍 Starting Zulip scrape...`);
  console.log(`   Channel: ${channel}`);
  console.log(`   Messages to fetch: ${numMessages}\n`);

  const scraper = createZulipchatScraperFromEnv();

  if (!scraper) {
    console.error('❌ Zulip scraper not configured.');
    console.error('   Please set ZULIP_BOT_EMAIL and ZULIP_API_KEY in your .env file.');
    console.error('\n   For instance-specific credentials, use:');
    console.error('   PROJECTA_ZULIP_BOT_EMAIL and PROJECTA_ZULIP_API_KEY\n');
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

  // Scrape messages
  try {
    const storedCount = await scraper.scrapeAndStoreMessages(channel, numMessages, true);

    console.log(`\n✅ Scrape completed!`);
    console.log(`   New messages stored: ${storedCount}`);
    console.log(`\n💡 Run 'npx tsx scripts/permanent/check-zulip-messages.ts' to see statistics.\n`);
  } catch (error: any) {
    console.error('❌ Scrape failed:', error.message);
    process.exit(1);
  }
}

main();
