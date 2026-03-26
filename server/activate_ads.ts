import { db } from "./db";
import { ads } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function activateAllAds() {
  try {
    await db.update(ads).set({ isActive: true });
    console.log("✅ All ads activated!");
  } catch (e) {
    console.error("Error activating ads:", e);
  }
}
