#!/usr/bin/env tsx
/**
 * Analyze Messages Script
 *
 * Analyzes unanalyzed messages using the AI analyzer.
 * Useful for bulk analysis after a full scrape.
 *
 * Usage:
 *   npx tsx server/scripts/analyze-messages.ts [limit]
 *
 * Example:
 *   npx tsx server/scripts/analyze-messages.ts 100
 */

import {
  runAnalyzeMessages,
  parseAnalyzeMessagesArgs,
  formatHeader,
  getProjectName,
} from './script-logic';

async function main() {
  const options = parseAnalyzeMessagesArgs(process.argv);
  const projectName = getProjectName();

  console.log('\n' + formatHeader(`${projectName} - AI Analysis`) + '\n');

  const result = await runAnalyzeMessages(options);

  if (!result.success) {
    console.error(`❌ Error: ${result.error}`);
    process.exit(1);
  }

  console.log('\n' + formatHeader('Analysis Complete!'));
  console.log(`\nMessages analyzed: ${result.analyzed}`);
  console.log(`Relevant messages: ${result.relevant}`);
  console.log(`Updates created: ${result.updatesCreated}`);
  console.log(`\nUnanalyzed messages remaining: ${result.remaining}`);

  if (result.remaining > 0) {
    console.log('\nTo analyze more messages, run this script again:');
    console.log(`  npx tsx server/scripts/analyze-messages.ts ${options.limit}\n`);
  }
}

main();
