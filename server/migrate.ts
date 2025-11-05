// Database migration and initialization - Prisma
// Migrated from Drizzle ORM - Wayne (2025-10-29)
import { db } from './db';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function initializeDatabase() {
  console.log('🔄 Initializing database...');

  try {
    // Check if migrations directory exists
    const migrationsPath = path.join(process.cwd(), 'prisma', 'migrations');

    if (fs.existsSync(migrationsPath) && fs.readdirSync(migrationsPath).length > 0) {
      console.log('📁 Found migrations directory, running migrations...');
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: { ...process.env }
      });
      console.log('✅ Database migrations completed');
    } else {
      console.log('📝 No migrations found, pushing schema directly...');
      await pushSchema();
    }

    console.log('✅ Database initialized successfully');

    // Check if we need to seed initial data
    await seedInitialDataIfNeeded();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Database initialization failed:', errorMessage);

    // Try to push schema as fallback
    try {
      console.log('🔄 Attempting to push schema directly...');
      await pushSchema();
      console.log('✅ Schema pushed successfully');

      // Try to seed after successful schema push
      await seedInitialDataIfNeeded();
    } catch (pushError) {
      const pushErrorMessage = pushError instanceof Error ? pushError.message : String(pushError);
      console.error('❌ Schema push failed:', pushErrorMessage);
      throw new Error(`Database initialization failed: ${errorMessage}`);
    }
  }
}

async function seedInitialDataIfNeeded() {
  try {
    // Check if documentation sections table has data
    const sectionCount = await db.documentationSection.count();

    if (sectionCount === 0) {
      console.log('📦 No documentation found, importing initial content...');

      // Check if import script exists
      const importScriptPath = path.join(process.cwd(), 'server', 'scripts', 'import-near-nodes-content.ts');

      if (fs.existsSync(importScriptPath)) {
        console.log('🚀 Running import script...');
        execSync('npx tsx server/scripts/import-near-nodes-content.ts', {
          stdio: 'inherit',
          cwd: process.cwd()
        });
        console.log('✅ Initial documentation imported successfully');
      } else {
        console.log('⚠️  Import script not found, skipping initial data seed');
      }
    } else {
      console.log(`✓ Found ${sectionCount} existing documentation sections, skipping import`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('⚠️  Warning: Could not check/seed initial data:', errorMessage);
    console.log('   You can manually populate data using: POST /api/trigger-job');
  }
}

async function pushSchema() {
  try {
    // Run prisma db push command (for development, skips migrations)
    console.log('🚀 Pushing database schema with Prisma...');
    execSync('npx prisma db push --accept-data-loss', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: { ...process.env }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Prisma push failed: ${errorMessage}`);
  }
}
