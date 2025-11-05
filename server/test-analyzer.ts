import { createAnalyzerFromEnv } from "./analyzer/gemini-analyzer";
import { storage } from "./storage";

async function testAnalyzer() {
  console.log("Testing Gemini analyzer...\n");
  
  const analyzer = createAnalyzerFromEnv();
  
  if (!analyzer) {
    console.error("ERROR: Analyzer not configured. Check GEMINI_API_KEY");
    process.exit(1);
  }
  
  // Get unanalyzed messages
  const messages = await storage.getUnanalyzedMessages();
  console.log(`Found ${messages.length} unanalyzed messages`);
  
  if (messages.length === 0) {
    console.log("No messages to analyze. Run scraper first.");
    process.exit(0);
  }
  
  // Test analyzing just 3 messages
  console.log("\nAnalyzing 3 messages...\n");
  const results = await analyzer.analyzeUnanalyzedMessages(3);
  
  console.log("\n=== Results ===");
  console.log(`Analyzed: ${results.analyzed}`);
  console.log(`Relevant: ${results.relevant}`);
  console.log(`Updates created: ${results.updatesCreated}`);
  
  // Check pending updates
  const pendingUpdates = await storage.getPendingUpdates();
  console.log(`\nTotal pending updates in database: ${pendingUpdates.length}`);
  
  if (pendingUpdates.length > 0) {
    console.log("\nLatest pending update:");
    const latest = pendingUpdates[0];
    console.log(`  Section: ${latest.sectionId}`);
    console.log(`  Type: ${latest.type}`);
    console.log(`  Status: ${latest.status}`);
    console.log(`  Summary: ${latest.summary}`);
  }
  
  console.log("\n✓ Analyzer test successful!");
}

testAnalyzer().catch(error => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
