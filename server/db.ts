// Database configuration - supports both local PostgreSQL and Neon serverless
import pg from 'pg';
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres';
import * as schema from "./schema";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Determine if we're using Neon serverless or local PostgreSQL
const isNeonServerless = process.env.DATABASE_URL.includes('neon.tech') ||
                         process.env.DATABASE_URL.includes('neon.database.host');

let db;

if (isNeonServerless) {
  // Use Neon serverless configuration (dynamic import for optional dependency)
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = await import("ws");

  neonConfig.webSocketConstructor = ws.default;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
} else {
  // Use standard PostgreSQL configuration
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  db = drizzleNodePostgres({ client, schema });
}

export { db };
