/**
 * Manual test script for Multi-Stream Scanner Phase 1
 * Run with: npx tsx test-stream.ts
 */

// Load environment variables
import './server/env.js';

import { streamManager } from './server/stream/stream-manager.js';

async function testStream() {
  console.log('='.repeat(60));
  console.log('Multi-Stream Scanner Phase 1 - Manual Test');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Initialize stream manager
    console.log('Step 1: Initializing StreamManager...');
    await streamManager.initialize();
    console.log('✓ StreamManager initialized\n');

    // Get health status
    console.log('Step 2: Checking stream health...');
    const health = await streamManager.getHealth();
    console.log('Health Status:');
    health.forEach((h) => {
      console.log(`  - ${h.streamId}: ${h.isHealthy ? '✓ Healthy' : '✗ Unhealthy'}`);
      console.log(`    Total Processed: ${h.totalProcessed}`);
      if (h.lastError) {
        console.log(`    Last Error: ${h.lastError}`);
      }
    });
    console.log('');

    // Get statistics
    console.log('Step 3: Getting statistics...');
    const stats = await streamManager.getStats();
    console.log('Statistics:');
    console.log(`  Total Streams: ${stats.totalStreams}`);
    console.log(`  Active Streams: ${stats.activeStreams}`);
    console.log(`  Running Streams: ${stats.runningStreams}`);
    console.log(`  Scheduled Streams: ${stats.scheduledStreams}`);
    console.log(`  Total Messages Processed: ${stats.totalMessagesProcessed}`);
    console.log('');

    // Run the csv-test stream manually
    console.log('Step 4: Running csv-test stream manually...');
    await streamManager.runStream('csv-test', 10);
    console.log('✓ Stream processing complete\n');

    // Get updated statistics
    console.log('Step 5: Getting updated statistics...');
    const updatedStats = await streamManager.getStats();
    console.log('Updated Statistics:');
    console.log(`  Total Messages Processed: ${updatedStats.totalMessagesProcessed}`);
    console.log('');

    console.log('='.repeat(60));
    console.log('Test Complete!');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testStream();
