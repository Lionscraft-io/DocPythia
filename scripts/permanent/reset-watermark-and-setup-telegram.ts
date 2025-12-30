/**
 * Reset Processing Watermark and Setup Telegram Bot
 * This script:
 * 1. Resets the processing watermark to 2025-01-01
 * 2. Registers the Telegram bot stream config from .env
 *
 * Run this after database reset to reinitialize the system
 * Author: Wayne
 * Date: 2025-11-06
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function setupWatermarkAndTelegram() {
  try {
    console.log('🚀 Starting watermark reset and Telegram setup...\n');

    // ========================================
    // 1. Reset Processing Watermark
    // ========================================
    console.log('📅 Resetting processing watermark to 2025-01-01...');

    const watermarkDate = new Date('2025-01-01T00:00:00.000Z');

    await prisma.processingWatermark.upsert({
      where: { id: 1 },
      update: {
        watermarkTime: watermarkDate,
        lastProcessedBatch: null,
      },
      create: {
        id: 1,
        watermarkTime: watermarkDate,
        lastProcessedBatch: null,
      },
    });

    console.log('✅ Processing watermark reset to:', watermarkDate.toISOString());

    // ========================================
    // 2. Setup Telegram Bot Stream Config
    // ========================================
    console.log('\n🤖 Setting up Telegram bot stream config...');

    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramMode = process.env.TELEGRAM_BOT_MODE || 'polling';
    const telegramPollingInterval = parseInt(process.env.TELEGRAM_POLLING_INTERVAL || '3000', 10);
    const telegramAllowedChats = process.env.TELEGRAM_ALLOWED_CHATS
      ? process.env.TELEGRAM_ALLOWED_CHATS.split(',').map((c) => c.trim())
      : [];
    const telegramIgnoreOld = process.env.TELEGRAM_IGNORE_OLD_MESSAGES !== 'false';
    const telegramProcessCommands = process.env.TELEGRAM_PROCESS_COMMANDS !== 'false';
    const telegramSaveRaw = process.env.TELEGRAM_SAVE_RAW_UPDATES !== 'false';

    if (!telegramBotToken) {
      console.error('❌ TELEGRAM_BOT_TOKEN not found in .env');
      console.log('   Skipping Telegram setup. Add the token and run this script again.');
    } else {
      const streamId = 'telegram-bot';

      const streamConfig = await prisma.streamConfig.upsert({
        where: { streamId },
        update: {
          adapterType: 'telegram-bot',
          config: {
            botToken: telegramBotToken,
            mode: telegramMode,
            pollingInterval: telegramPollingInterval,
            allowedChats: telegramAllowedChats,
            ignoreOldMessages: telegramIgnoreOld,
            processCommands: telegramProcessCommands,
            saveRawUpdates: telegramSaveRaw,
          },
          enabled: true,
        },
        create: {
          streamId,
          adapterType: 'telegram-bot',
          config: {
            botToken: telegramBotToken,
            mode: telegramMode,
            pollingInterval: telegramPollingInterval,
            allowedChats: telegramAllowedChats,
            ignoreOldMessages: telegramIgnoreOld,
            processCommands: telegramProcessCommands,
            saveRawUpdates: telegramSaveRaw,
          },
          enabled: true,
        },
      });

      console.log('✅ Telegram bot stream config created/updated:');
      console.log('   Stream ID:', streamConfig.streamId);
      console.log('   Adapter Type:', streamConfig.adapterType);
      console.log('   Mode:', telegramMode);
      console.log('   Polling Interval:', telegramPollingInterval, 'ms');
      console.log(
        '   Allowed Chats:',
        telegramAllowedChats.length > 0 ? telegramAllowedChats : 'All chats allowed'
      );
      console.log('   Ignore Old Messages:', telegramIgnoreOld);
      console.log('   Process Commands:', telegramProcessCommands);
      console.log('   Enabled:', streamConfig.enabled);
    }

    // ========================================
    // 3. Summary
    // ========================================
    console.log('\n✨ Setup Complete!\n');

    const allStreams = await prisma.streamConfig.findMany({
      orderBy: { createdAt: 'asc' },
    });

    console.log('📊 Current Stream Configurations:');
    allStreams.forEach((stream, idx) => {
      console.log(
        `   ${idx + 1}. ${stream.streamId} (${stream.adapterType}) - ${stream.enabled ? 'Enabled' : 'Disabled'}`
      );
    });

    const watermark = await prisma.processingWatermark.findUnique({
      where: { id: 1 },
    });

    console.log('\n⏰ Processing Watermark:');
    console.log('   Watermark Time:', watermark?.watermarkTime.toISOString());
    console.log(
      '   Last Processed Batch:',
      watermark?.lastProcessedBatch?.toISOString() || 'Never'
    );
  } catch (error) {
    console.error('💥 Setup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup
setupWatermarkAndTelegram()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
