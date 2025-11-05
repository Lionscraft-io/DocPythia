import { createZulipchatScraperFromEnv } from "./scraper/zulipchat";

async function testScraper() {
  console.log("Testing Zulipchat scraper...");
  
  const scraper = createZulipchatScraperFromEnv();
  
  if (!scraper) {
    console.error("ERROR: Scraper not configured. Check ZULIP_BOT_EMAIL and ZULIP_API_KEY");
    process.exit(1);
  }
  
  // Test connection
  console.log("\n1. Testing connection...");
  const connected = await scraper.testConnection();
  if (!connected) {
    console.error("ERROR: Failed to connect to Zulipchat");
    process.exit(1);
  }
  console.log("✓ Connection successful");
  
  // Fetch a few messages from community-support
  console.log("\n2. Fetching 10 messages from community-support channel...");
  try {
    const messages = await scraper.fetchMessages("community-support", 10);
    console.log(`✓ Fetched ${messages.length} messages`);
    
    if (messages.length > 0) {
      const latest = messages[0];
      console.log("\nLatest message:");
      console.log(`  From: ${latest.sender_full_name} (${latest.sender_email})`);
      console.log(`  Topic: ${latest.subject}`);
      console.log(`  Date: ${new Date(latest.timestamp * 1000).toISOString()}`);
      console.log(`  Content preview: ${latest.content.substring(0, 100)}...`);
    }
    
    console.log("\n✓ Scraper test successful!");
  } catch (error: any) {
    console.error("ERROR during fetch:", error.message);
    process.exit(1);
  }
}

testScraper();
