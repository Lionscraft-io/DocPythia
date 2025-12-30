import { createZulipchatScraperFromEnv } from './scraper/zulipchat';

async function testScraperStore() {
  console.log('Testing Zulipchat scraper with database storage...');

  const scraper = createZulipchatScraperFromEnv();

  if (!scraper) {
    console.error('ERROR: Scraper not configured');
    process.exit(1);
  }

  console.log('\nScraping and storing 50 messages from community-support...');
  try {
    const storedCount = await scraper.scrapeAndStoreMessages('community-support', 50);
    console.log(`\n✓ Successfully stored ${storedCount} new messages`);
    console.log('  (Messages already in database were skipped)');
  } catch (error: any) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

testScraperStore();
