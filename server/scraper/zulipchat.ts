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

  async scrapeAndStoreMessages(channelName: string, numMessages: number = 100): Promise<number> {
    console.log(`Scraping ${numMessages} messages from channel: ${channelName}`);
    
    const messages = await this.fetchMessages(channelName, numMessages);
    let storedCount = 0;
    let skippedCount = 0;

    for (const message of messages) {
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
        messageTimestamp: new Date(message.timestamp * 1000),
        analyzed: false,
      });

      storedCount++;
    }

    console.log(`Scraping complete: ${storedCount} new messages stored, ${skippedCount} already existed`);
    return storedCount;
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
