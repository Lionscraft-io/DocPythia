#!/usr/bin/env npx tsx
/**
 * Check Zulip message statistics in the database
 * Shows message counts by channel and source
 */

import { db } from '../../server/db';

async function checkZulipMessages() {
  try {
    console.log('📊 Zulip Message Statistics\n');
    console.log('='.repeat(60));

    // Get total message count
    const totalMessages = await db.scrapedMessage.count();
    console.log(`\n📨 Total Messages (all sources): ${totalMessages}`);

    // Get Zulip message count
    const zulipMessages = await db.scrapedMessage.count({
      where: { source: 'zulipchat' }
    });
    console.log(`🔵 Zulip Messages: ${zulipMessages}`);

    // Get Telegram message count
    const telegramMessages = await db.scrapedMessage.count({
      where: { source: 'telegram' }
    });
    console.log(`🔷 Telegram Messages: ${telegramMessages}`);

    // Get Zulip messages by channel
    console.log('\n' + '='.repeat(60));
    console.log('📂 Zulip Messages by Channel:\n');

    const zulipByChannel = await db.scrapedMessage.groupBy({
      by: ['channelName'],
      where: { source: 'zulipchat' },
      _count: { id: true }
    });

    if (zulipByChannel.length === 0) {
      console.log('   No Zulip messages found in database.');
    } else {
      for (const channel of zulipByChannel) {
        console.log(`   ${channel.channelName}: ${channel._count.id} messages`);
      }
    }

    // Get analyzed vs unanalyzed count
    console.log('\n' + '='.repeat(60));
    console.log('📊 Analysis Status (All Sources):\n');

    const analyzedCount = await db.scrapedMessage.count({
      where: { analyzed: true }
    });

    const unanalyzedCount = await db.scrapedMessage.count({
      where: { analyzed: false }
    });

    console.log(`   ✅ Analyzed: ${analyzedCount}`);
    console.log(`   ⏳ Unanalyzed: ${unanalyzedCount}`);

    // Get scrape metadata for Zulip
    console.log('\n' + '='.repeat(60));
    console.log('🔄 Scrape Metadata (Zulip):\n');

    const scrapeMetadata = await db.scrapeMetadata.findMany({
      where: { source: 'zulipchat' }
    });

    if (scrapeMetadata.length === 0) {
      console.log('   No scrape metadata found.');
    } else {
      for (const meta of scrapeMetadata) {
        console.log(`   Channel: ${meta.channelName}`);
        console.log(`     Last Message ID: ${meta.lastMessageId || 'N/A'}`);
        console.log(`     Last Scrape: ${meta.lastScrapeAt?.toISOString() || 'N/A'}`);
        console.log(`     Last Message Time: ${meta.lastScrapeTimestamp?.toISOString() || 'N/A'}`);
        console.log(`     Total Fetched: ${meta.totalMessagesFetched || 0}`);
        console.log('');
      }
    }

    // Get date range of messages
    console.log('='.repeat(60));
    console.log('📅 Message Date Range (Zulip):\n');

    const oldestZulip = await db.scrapedMessage.findFirst({
      where: { source: 'zulipchat' },
      orderBy: { messageTimestamp: 'asc' }
    });

    const newestZulip = await db.scrapedMessage.findFirst({
      where: { source: 'zulipchat' },
      orderBy: { messageTimestamp: 'desc' }
    });

    if (oldestZulip && newestZulip) {
      console.log(`   Oldest: ${oldestZulip.messageTimestamp.toISOString()}`);
      console.log(`   Newest: ${newestZulip.messageTimestamp.toISOString()}`);

      const daysDiff = Math.ceil(
        (newestZulip.messageTimestamp.getTime() - oldestZulip.messageTimestamp.getTime())
        / (1000 * 60 * 60 * 24)
      );
      console.log(`   Span: ${daysDiff} days`);
    } else {
      console.log('   No Zulip messages found.');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Statistics retrieved successfully\n');

  } catch (error) {
    console.error('❌ Error fetching message statistics:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// Run the script
checkZulipMessages();
