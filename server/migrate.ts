// Database migration and initialization
import { db } from './db';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import fs from 'fs';
import path from 'path';

export async function initializeDatabase() {
  console.log('🔄 Initializing database...');

  try {
    // Check if migrations directory exists
    const migrationsPath = path.join(process.cwd(), 'drizzle');

    if (fs.existsSync(migrationsPath)) {
      console.log('📁 Found migrations directory, running migrations...');
      await migrate(db, { migrationsFolder: migrationsPath });
      console.log('✅ Database migrations completed');
    } else {
      console.log('📝 No migrations found, pushing schema directly...');
      await pushSchema();
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);

    // Try to push schema as fallback
    try {
      console.log('🔄 Attempting to push schema directly...');
      await pushSchema();
      console.log('✅ Schema pushed successfully');
    } catch (pushError) {
      console.error('❌ Schema push failed:', pushError.message);
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }
}

async function pushSchema() {
  // Import drizzle-kit functions for schema push
  const { execSync } = await import('child_process');

  try {
    // Run drizzle-kit push command
    console.log('🚀 Pushing database schema...');
    execSync('npx drizzle-kit push', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
  } catch (error) {
    // If drizzle-kit fails, try to create tables manually
    await createTablesManually();
  }
}

async function createTablesManually() {
  console.log('🛠️ Creating tables manually...');

  // Import schema to get table definitions
  const schema = await import('./schema');

  // Create tables using drizzle's introspection
  const { sql } = await import('drizzle-orm');

  // Basic table creation queries
  const createQueries = [
    sql`CREATE TABLE IF NOT EXISTS "documentation_sections" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "title" varchar(255) NOT NULL,
      "content" text NOT NULL,
      "section_type" text DEFAULT 'text',
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    )`,

    sql`CREATE TABLE IF NOT EXISTS "pending_updates" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "section_id" uuid REFERENCES "documentation_sections"("id"),
      "summary" text NOT NULL,
      "diff_before" text,
      "diff_after" text,
      "update_type" text DEFAULT 'minor',
      "status" text DEFAULT 'pending',
      "created_at" timestamp DEFAULT now(),
      "reviewed_at" timestamp,
      "reviewed_by" varchar(255)
    )`,

    sql`CREATE TABLE IF NOT EXISTS "scraped_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "message_id" varchar(255) UNIQUE NOT NULL,
      "channel" varchar(255) NOT NULL,
      "author" varchar(255) NOT NULL,
      "content" text NOT NULL,
      "timestamp" timestamp NOT NULL,
      "analyzed" boolean DEFAULT false,
      "created_at" timestamp DEFAULT now()
    )`
  ];

  for (const query of createQueries) {
    try {
      await db.execute(query);
      console.log('✅ Table created successfully');
    } catch (error) {
      console.log('⚠️ Table might already exist:', error.message);
    }
  }
}