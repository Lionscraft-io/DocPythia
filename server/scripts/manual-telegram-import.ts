/**
 * Manual Telegram Import Script
 * Fetches updates from Telegram API and imports them directly to database
 * Workaround for node-fetch timeout issues
 */

import prisma from '../db.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8578664234:AAHG0lJzyMHYQVRjSfHTub42CYc9zEreMm8';
const STREAM_ID = 'telegram-bot-neardocs';

interface TelegramUpdate {
  update_id: number;
  channel_post?: {
    message_id: number;
    sender_chat?: {
      id: number;
      title: string;
      type: string;
    };
    chat: {
      id: number;
      title: string;
      type: string;
    };
    date: number;
    text?: string;
  };
}

async function fetchTelegramUpdates(): Promise<TelegramUpdate[]> {
  // Use curl since Node.js https has connectivity issues
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`;

  try {
    const { stdout } = await execAsync(`curl -s "${url}"`);
    const json = JSON.parse(stdout);

    if (json.ok) {
      return json.result;
    } else {
      throw new Error(`Telegram API error: ${JSON.stringify(json)}`);
    }
  } catch (err: any) {
    throw new Error(`Failed to fetch updates: ${err.message}`);
  }
}

async function importUpdates() {
  console.log('Fetching updates from Telegram API...');

  try {
    const updates = await fetchTelegramUpdates();
    console.log(`Found ${updates.length} updates`);

    let imported = 0;

    for (const update of updates) {
      if (!update.channel_post || !update.channel_post.text) {
        continue; // Skip non-text or non-channel messages
      }

      const post = update.channel_post;
      const messageId = `${post.chat.id}-${post.message_id}`;
      const timestamp = new Date(post.date * 1000);
      const author = post.sender_chat?.title || 'Unknown';
      const channel = post.chat.title;
      const content = post.text;

      // Check if message already exists
      const existing = await prisma.unifiedMessage.findUnique({
        where: {
          streamId_messageId: {
            streamId: STREAM_ID,
            messageId: messageId,
          },
        },
      });

      if (existing) {
        console.log(`Skipping existing message: ${messageId}`);
        continue;
      }

      // Insert message
      await prisma.unifiedMessage.create({
        data: {
          streamId: STREAM_ID,
          messageId: messageId,
          author,
          channel,
          content,
          timestamp,
          processingStatus: 'PENDING',
          rawData: { update_id: update.update_id, channel_post: post },
        },
      });

      console.log(`✓ Imported: ${messageId} from ${author} in ${channel}`);
      imported++;
    }

    console.log(`\nImported ${imported} new messages`);

    // Update watermark
    if (updates.length > 0) {
      const lastUpdate = updates[updates.length - 1];
      await prisma.importWatermark.upsert({
        where: {
          streamId_resourceId: {
            streamId: STREAM_ID,
            resourceId: null,
          },
        },
        create: {
          streamId: STREAM_ID,
          streamType: 'telegram-bot',
          lastImportedId: lastUpdate.update_id.toString(),
          lastImportedTime: new Date(),
        },
        update: {
          lastImportedId: lastUpdate.update_id.toString(),
          lastImportedTime: new Date(),
        },
      });
      console.log(`Updated watermark to update_id: ${lastUpdate.update_id}`);
    }

  } catch (error) {
    console.error('Error importing updates:', error);
    process.exit(1);
  }
}

// Run import
importUpdates()
  .then(() => {
    console.log('Import complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
