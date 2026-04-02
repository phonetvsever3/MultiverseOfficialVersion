import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import fs from "fs";
import path from "path";

const { Pool } = pg;

// Check for a local DATABASE_URL override file.
// This lets the admin switch databases from the web dashboard without
// touching environment variables manually on the server.
const DB_OVERRIDE_PATH = path.resolve(".db-override.json");
if (fs.existsSync(DB_OVERRIDE_PATH)) {
  try {
    const override = JSON.parse(fs.readFileSync(DB_OVERRIDE_PATH, "utf8"));
    if (override.DATABASE_URL) {
      process.env.DATABASE_URL = override.DATABASE_URL;
    }
  } catch {
    console.warn("[DB] Could not read .db-override.json — ignoring.");
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
