/**
 * Documentation Index Inspector
 * Helper script to view and debug the documentation index
 * Usage: npx tsx server/scripts/inspect-doc-index.ts [--full]
 */

import { docIndexGenerator } from '../stream/doc-index-generator.js';

async function main() {
  const args = process.argv.slice(2);
  const fullFormat = args.includes('--full');

  console.log('\n='.repeat(80));
  console.log('DOCUMENTATION INDEX INSPECTOR');
  console.log('='.repeat(80));

  // Get cache status
  const cacheStatus = await docIndexGenerator.getCacheStatus();
  console.log('\nCache Status:');
  console.log(`  Cached: ${cacheStatus.cached}`);
  console.log(
    `  Commit Hash: ${cacheStatus.commitHash ? cacheStatus.commitHash.substring(0, 8) : 'N/A'}`
  );
  console.log(
    `  Generated At: ${cacheStatus.expiresAt ? cacheStatus.expiresAt.toISOString() : 'N/A'}`
  );

  console.log('\nGenerating index...\n');

  const index = await docIndexGenerator.generateIndex();

  console.log('\n=== INDEX SUMMARY ===\n');
  console.log(`Total Pages: ${index.pages.length}`);
  console.log(`Generated At: ${index.generated_at.toISOString()}`);
  console.log(`\nCategories: ${Object.keys(index.categories).length}`);

  for (const [category, paths] of Object.entries(index.categories)) {
    console.log(`  - ${category}: ${paths.length} pages`);
  }

  console.log('\n=== PAGES ===\n');

  for (const page of index.pages) {
    console.log(`📄 ${page.title}`);
    console.log(`   Path: ${page.path}`);
    console.log(`   Sections: ${page.sections.length}`);
    console.log(`   Summary Length: ${page.summary.length} chars`);
    console.log(`   Last Updated: ${page.last_updated.toISOString()}`);
    console.log();
  }

  if (fullFormat) {
    console.log('\n=== FULL FORMAT (for LLM prompts) ===\n');
    console.log(docIndexGenerator.formatForPrompt(index));
  } else {
    console.log('\n=== COMPACT FORMAT (for LLM prompts) ===\n');
    console.log(docIndexGenerator.formatCompact(index));
  }

  console.log('\n=== TOKEN ESTIMATE ===\n');

  const compactText = docIndexGenerator.formatCompact(index);
  const fullText = docIndexGenerator.formatForPrompt(index);

  const compactTokens = Math.ceil(compactText.length / 4);
  const fullTokens = Math.ceil(fullText.length / 4);

  console.log(`Compact format:`);
  console.log(`  Characters: ${compactText.length}`);
  console.log(`  Estimated tokens: ~${compactTokens}`);
  console.log();
  console.log(`Full format:`);
  console.log(`  Characters: ${fullText.length}`);
  console.log(`  Estimated tokens: ~${fullTokens}`);

  console.log('\n='.repeat(80));
  console.log('Use --full flag to see full format output');
  console.log('='.repeat(80));
}

main().catch(console.error);
