import { storage } from "../storage";

export interface ZulipConfig {
  email: string;
  apiKey: string;
  site: string;
}

export interface ZulipMessage {
  id: number;
  sender_id: number;
  sender_full_name: string;
  sender_email: string;
  timestamp: number;
  content: string;
  display_recipient: string | Array<{ id: number; email: string; full_name: string }>;
  subject: string;
  type: "stream" | "private";
}

export interface ZulipMessagesResponse {
  messages: ZulipMessage[];
  result: string;
  msg: string;
}

export class ZulipchatScraper {
  private config: ZulipConfig;

  constructor(config: ZulipConfig) {
    this.config = config;
  }

  private getAuthHeader(): string {
    const credentials = `${this.config.email}:${this.config.apiKey}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  async fetchMessages(
    channelName: string,
    numBefore: number = 100,
    anchor: string | number = "newest"
  ): Promise<ZulipMessage[]> {
    // Use "stream" operator (not "channel") per Zulip API docs
    const narrow = [{ operator: "stream", operand: channelName }];
    const params = new URLSearchParams({
      anchor: anchor.toString(),
      num_before: numBefore.toString(),
      num_after: "0",
      narrow: JSON.stringify(narrow),
      apply_markdown: "false", // Get raw content for AI analysis
    });

    const url = `${this.config.site}/api/v1/messages?${params.toString()}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zulipchat API error (${response.status}): ${errorText}`);
    }

    const data: ZulipMessagesResponse = await response.json();
    
    if (data.result !== "success") {
      throw new Error(`Zulipchat API error: ${data.msg}`);
    }

    return data.messages;
  }

  async scrapeAndStoreMessages(
    channelName: string,
    numMessages: number = 100,
    incremental: boolean = true
  ): Promise<number> {
    console.log(`Scraping messages from channel: ${channelName} (incremental: ${incremental})`);
    
    let messages: ZulipMessage[];
    let metadata = await storage.getScrapeMetadata("zulipchat", channelName);
    
    if (incremental && metadata?.lastScrapeTimestamp) {
      // Incremental scrape: fetch messages since last scrape
      console.log(`  Last scrape: ${metadata.lastScrapeTimestamp.toISOString()}`);
      console.log(`  Fetching messages since last scrape...`);
      
      // Use the last message timestamp as anchor and fetch newer messages
      const lastTimestamp = Math.floor(metadata.lastScrapeTimestamp.getTime() / 1000);
      
      // Fetch messages with anchor at last timestamp, getting messages after it
      const narrow = [
        { operator: "stream", operand: channelName },
        { operator: "date", operand: new Date(lastTimestamp * 1000).toISOString().split('T')[0] }
      ];
      const params = new URLSearchParams({
        anchor: lastTimestamp.toString(),
        num_before: "0",
        num_after: numMessages.toString(),
        narrow: JSON.stringify(narrow),
        apply_markdown: "false",
      });

      const url = `${this.config.site}/api/v1/messages?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Zulipchat API error (${response.status})`);
      }

      const data: ZulipMessagesResponse = await response.json();
      messages = data.messages.filter(msg => msg.timestamp > lastTimestamp);
    } else {
      // Full scrape: fetch all messages (paginated)
      console.log(`  Performing full scrape (${numMessages} messages)...`);
      messages = await this.fetchMessages(channelName, numMessages);
    }

    let storedCount = 0;
    let skippedCount = 0;
    let latestTimestamp: Date | null = metadata?.lastScrapeTimestamp || null;

    for (const message of messages) {
      const msgTimestamp = new Date(message.timestamp * 1000);
      
      // Check if message already exists
      const existing = await storage.getMessageByMessageId(message.id.toString());
      
      if (existing) {
        skippedCount++;
        continue;
      }

      // Store message
      await storage.createScrapedMessage({
        messageId: message.id.toString(),
        source: "zulipchat",
        channelName: channelName,
        topicName: message.subject,
        senderEmail: message.sender_email,
        senderName: message.sender_full_name,
        content: message.content,
        messageTimestamp: msgTimestamp,
        analyzed: false,
      });

      // Track latest timestamp
      if (!latestTimestamp || msgTimestamp > latestTimestamp) {
        latestTimestamp = msgTimestamp;
      }

      storedCount++;
    }

    // Update scrape metadata
    if (storedCount > 0 || !metadata) {
      await storage.createOrUpdateScrapeMetadata({
        source: "zulipchat",
        channelName: channelName,
        lastScrapeTimestamp: latestTimestamp,
        totalMessagesFetched: storedCount,
      });
    }

    console.log(`Scraping complete: ${storedCount} new messages stored, ${skippedCount} already existed`);
    return storedCount;
  }

  async performFullScrape(channelName: string, batchSize: number = 1000): Promise<number> {
    console.log(`\n=== FULL SCRAPE ===`);
    console.log(`Fetching ALL messages from channel: ${channelName}`);
    
    let totalStored = 0;
    let anchor: string | number = "newest";
    let hasMore = true;
    let batchCount = 0;

    while (hasMore && batchCount < 100) { // Safety limit of 100 batches
      batchCount++;
      console.log(`\nBatch ${batchCount}: Fetching ${batchSize} messages (anchor: ${anchor})...`);
      
      const messages = await this.fetchMessages(channelName, batchSize, anchor);
      
      if (messages.length === 0) {
        hasMore = false;
        break;
      }

      let storedCount = 0;
      let latestTimestamp: Date | null = null;

      for (const message of messages) {
        const msgTimestamp = new Date(message.timestamp * 1000);
        
        const existing = await storage.getMessageByMessageId(message.id.toString());
        if (existing) continue;

        await storage.createScrapedMessage({
          messageId: message.id.toString(),
          source: "zulipchat",
          channelName: channelName,
          topicName: message.subject,
          senderEmail: message.sender_email,
          senderName: message.sender_full_name,
          content: message.content,
          messageTimestamp: msgTimestamp,
          analyzed: false,
        });

        if (!latestTimestamp || msgTimestamp > latestTimestamp) {
          latestTimestamp = msgTimestamp;
        }

        storedCount++;
      }

      totalStored += storedCount;
      console.log(`  Batch ${batchCount}: ${storedCount} new messages stored`);

      // Update anchor to the oldest message ID for next batch
      if (messages.length > 0) {
        anchor = messages[messages.length - 1].id;
      }

      // If we got fewer messages than requested, we've reached the end
      if (messages.length < batchSize) {
        hasMore = false;
      }

      // Update metadata after each batch
      if (storedCount > 0) {
        await storage.createOrUpdateScrapeMetadata({
          source: "zulipchat",
          channelName: channelName,
          lastScrapeTimestamp: latestTimestamp,
          totalMessagesFetched: storedCount,
        });
      }
    }

    console.log(`\n=== FULL SCRAPE COMPLETE ===`);
    console.log(`Total messages stored: ${totalStored} across ${batchCount} batches`);
    return totalStored;
  }

  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.config.site}/api/v1/users/me`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });

      return response.ok;
    } catch (error) {
      console.error("Zulipchat connection test failed:", error);
      return false;
    }
  }
}

export function createZulipchatScraperFromEnv(): ZulipchatScraper | null {
  const email = process.env.ZULIP_BOT_EMAIL;
  const apiKey = process.env.ZULIP_API_KEY;
  const site = process.env.ZULIP_SITE || "https://near.zulipchat.com";

  if (!email || !apiKey) {
    console.warn("Zulipchat credentials not found in environment variables");
    return null;
  }

  return new ZulipchatScraper({ email, apiKey, site });
}
