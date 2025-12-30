#!/usr/bin/env npx tsx
/**
 * Reset processing watermarks (per-stream) to reprocess all unprocessed messages
 * This forces the batch processor to start from the beginning for each stream
 */

import { db } from '../../server/db';

async function main() {
  const streamId = process.argv[2]; // Optional: reset specific stream

  console.log('🔄 Resetting processing watermarks...\n');

  try {
    // Get all streams with pending messages
    const streamsWithPending = await db.unifiedMessage.findMany({
      where: { processingStatus: 'PENDING' },
      distinct: ['streamId'],
      select: { streamId: true },
    });

    if (streamsWithPending.length === 0) {
      console.log('✅ No unprocessed messages found. Nothing to do.\n');
      return;
    }

    console.log(`Found ${streamsWithPending.length} stream(s) with pending messages:\n`);

    for (const { streamId: sid } of streamsWithPending) {
      // Skip if specific stream requested and this isn't it
      if (streamId && sid !== streamId) continue;

      // Get current watermark for this stream
      const currentWatermark = await db.processingWatermark.findUnique({
        where: { streamId: sid },
      });

      console.log(`Stream: ${sid}`);
      if (currentWatermark) {
        console.log(`  Current watermark: ${currentWatermark.watermarkTime.toISOString()}`);
      } else {
        console.log(`  No watermark (will be auto-created)`);
      }

      // Get oldest unprocessed message for this stream
      const oldestMessage = await db.unifiedMessage.findFirst({
        where: { streamId: sid, processingStatus: 'PENDING' },
        orderBy: { timestamp: 'asc' },
      });

      if (!oldestMessage) {
        console.log(`  No pending messages\n`);
        continue;
      }

      console.log(`  Oldest pending: ${oldestMessage.timestamp.toISOString()}`);

      // Reset watermark to just before the oldest unprocessed message
      const newWatermarkTime = new Date(oldestMessage.timestamp.getTime() - 1000); // 1 second before

      await db.processingWatermark.upsert({
        where: { streamId: sid },
        update: {
          watermarkTime: newWatermarkTime,
          lastProcessedBatch: null,
        },
        create: {
          streamId: sid,
          watermarkTime: newWatermarkTime,
          lastProcessedBatch: null,
        },
      });

      console.log(`  ✅ Reset to: ${newWatermarkTime.toISOString()}\n`);
    }

    console.log('📋 Next steps:');
    console.log('  1. Restart your server (if needed)');
    console.log('  2. Click "Process Messages" in the admin dashboard');
    console.log('  3. Each stream will process its pending messages independently\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
