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

  // Basic table creation queries - matches schema.ts exactly
  const createQueries = [
    // Create enums first
    sql`DO $$ BEGIN
      CREATE TYPE section_type AS ENUM ('text', 'info', 'warning', 'success');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    sql`DO $$ BEGIN
      CREATE TYPE update_type AS ENUM ('minor', 'major', 'add', 'delete');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    sql`DO $$ BEGIN
      CREATE TYPE update_status AS ENUM ('pending', 'approved', 'rejected', 'auto-applied');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    sql`DO $$ BEGIN
      CREATE TYPE action_type AS ENUM ('approved', 'rejected', 'auto-applied');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    sql`DO $$ BEGIN
      CREATE TYPE message_source AS ENUM ('zulipchat', 'telegram');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    sql`DO $$ BEGIN
      CREATE TYPE version_op AS ENUM ('add', 'edit', 'delete', 'rollback');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$`,

    // Documentation sections table
    sql`CREATE TABLE IF NOT EXISTS "documentation_sections" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
      "section_id" text NOT NULL UNIQUE,
      "title" text NOT NULL,
      "content" text NOT NULL,
      "level" integer,
      "type" section_type,
      "order_index" integer NOT NULL,
      "updated_at" timestamp NOT NULL DEFAULT now()
    )`,

    // Pending updates table
    sql`CREATE TABLE IF NOT EXISTS "pending_updates" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
      "section_id" text NOT NULL,
      "type" update_type NOT NULL,
      "summary" text NOT NULL,
      "source" text NOT NULL,
      "status" update_status NOT NULL DEFAULT 'pending',
      "diff_before" text,
      "diff_after" text,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "reviewed_at" timestamp,
      "reviewed_by" text
    )`,

    // Update history table
    sql`CREATE TABLE IF NOT EXISTS "update_history" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
      "update_id" varchar NOT NULL REFERENCES "pending_updates"("id") ON DELETE CASCADE,
      "action" action_type NOT NULL,
      "performed_at" timestamp NOT NULL DEFAULT now(),
      "performed_by" text
    )`,

    // Scraped messages table
    sql`CREATE TABLE IF NOT EXISTS "scraped_messages" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
      "message_id" text NOT NULL UNIQUE,
      "source" message_source NOT NULL,
      "channel_name" text NOT NULL,
      "topic_name" text,
      "sender_email" text,
      "sender_name" text,
      "content" text NOT NULL,
      "message_timestamp" timestamp NOT NULL,
      "scraped_at" timestamp NOT NULL DEFAULT now(),
      "analyzed" boolean NOT NULL DEFAULT false
    )`,

    // Scrape metadata table
    sql`CREATE TABLE IF NOT EXISTS "scrape_metadata" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
      "source" message_source NOT NULL,
      "channel_name" text NOT NULL,
      "last_message_id" text,
      "last_scrape_timestamp" timestamp,
      "last_scrape_at" timestamp NOT NULL DEFAULT now(),
      "total_messages_fetched" integer NOT NULL DEFAULT 0
    )`,

    // Section versions table
    sql`CREATE TABLE IF NOT EXISTS "section_versions" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
      "section_id" text NOT NULL,
      "title" text NOT NULL,
      "content" text NOT NULL,
      "level" integer,
      "type" section_type,
      "order_index" integer NOT NULL,
      "op" version_op NOT NULL,
      "parent_version_id" varchar,
      "from_update_id" varchar REFERENCES "pending_updates"("id") ON DELETE SET NULL,
      "from_history_id" varchar REFERENCES "update_history"("id") ON DELETE SET NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "created_by" text
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