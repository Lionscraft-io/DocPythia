import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function importTestData() {
  try {
    console.log('🚀 Starting CSV import...');

    // Read and parse CSV file
    const csvPath = join(process.cwd(), 'testdata.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`📊 Found ${records.length} records in CSV`);

    // Create or get StreamConfig for this CSV import
    const streamId = 'csv-testdata-conflux';
    const streamConfig = await prisma.streamConfig.upsert({
      where: { streamId },
      update: {},
      create: {
        streamId,
        adapterType: 'csv',
        config: {
          filePath: 'testdata.csv',
          source: 'conflux-community',
          description: 'Test data from Conflux community discussions'
        },
        enabled: true,
      },
    });

    console.log(`✅ StreamConfig created/found: ${streamConfig.streamId}`);

    // Import messages
    let imported = 0;
    let skipped = 0;

    for (const record of records) {
      try {
        // Generate a unique messageId from timestamp and content
        const messageId = `csv-${record.timestamp}-${record.author.substring(0, 20)}`;

        // Check if message already exists
        const existing = await prisma.unifiedMessage.findUnique({
          where: {
            streamId_messageId: {
              streamId,
              messageId,
            },
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Parse timestamp
        const timestamp = new Date(record.timestamp);

        // Import message
        await prisma.unifiedMessage.create({
          data: {
            streamId,
            messageId,
            timestamp,
            author: record.author || 'Unknown',
            content: record.content || '',
            channel: record.channel || null,
            rawData: {
              originalTimestamp: record.timestamp,
              csvRow: record,
            },
            metadata: {
              importedFrom: 'testdata.csv',
              importedAt: new Date().toISOString(),
            },
            processingStatus: 'PENDING',
          },
        });

        imported++;

        if (imported % 10 === 0) {
          console.log(`📝 Imported ${imported}/${records.length} messages...`);
        }
      } catch (error) {
        console.error(`❌ Error importing record:`, record, error);
      }
    }

    // Create/update ImportWatermark
    await prisma.importWatermark.upsert({
      where: {
        streamId_resourceId: {
          streamId,
          resourceId: 'testdata.csv',
        },
      },
      update: {
        importComplete: true,
        lastImportedTime: new Date(),
        updatedAt: new Date(),
      },
      create: {
        streamId,
        streamType: 'csv',
        resourceId: 'testdata.csv',
        importComplete: true,
        lastImportedTime: new Date(),
      },
    });

    console.log(`\n✨ Import complete!`);
    console.log(`  - Imported: ${imported} messages`);
    console.log(`  - Skipped: ${skipped} duplicates`);
    console.log(`  - Total: ${records.length} records processed`);
  } catch (error) {
    console.error('💥 Import failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importTestData()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
