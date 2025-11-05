/**
 * Test script to generate and display documentation index
 * Author: Wayne
 * Date: 2025-10-30
 */

import { docIndexGenerator } from './doc-index-generator.js';

async function main() {
  console.log('Generating documentation index from database...\n');

  try {
    const index = await docIndexGenerator.generateIndex();

    console.log('=== DOCUMENTATION INDEX ===\n');
    console.log(`Total Pages: ${index.pages.length}`);
    console.log(`Total Categories: ${Object.keys(index.categories).length}`);
    console.log(`Generated At: ${index.generated_at.toISOString()}\n`);

    // Show category breakdown
    console.log('--- Categories ---');
    const sortedCategories = Object.entries(index.categories).sort((a, b) => b[1].length - a[1].length);
    for (const [category, paths] of sortedCategories.slice(0, 20)) {
      console.log(`${category}: ${paths.length} pages`);
    }

    console.log('\n--- Sample Pages (first 10) ---');
    for (const page of index.pages.slice(0, 10)) {
      console.log(`\n## ${page.title}`);
      console.log(`Path: ${page.path}`);
      console.log(`Summary: ${page.summary}`);
      console.log(`Sections: ${page.sections.length}`);
      if (page.sections.length > 0) {
        console.log(`First sections: ${page.sections.slice(0, 3).join(', ')}`);
      }
    }

    // Generate compact format
    console.log('\n\n=== COMPACT FORMAT FOR LLM ===\n');
    const compact = docIndexGenerator.formatCompact(index);
    console.log(compact.substring(0, 2000) + '\n... (truncated)');

    // Cache status
    const cacheStatus = docIndexGenerator.getCacheStatus();
    console.log('\n=== CACHE STATUS ===');
    console.log(`Cached: ${cacheStatus.cached}`);
    console.log(`Expires At: ${cacheStatus.expiresAt?.toISOString() || 'N/A'}`);

  } catch (error) {
    console.error('Error generating index:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
