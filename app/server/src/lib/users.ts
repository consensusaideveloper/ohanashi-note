import { eq } from "drizzle-orm";

import { db } from "../db/connection.js";
import { users } from "../db/schema.js";

/**
 * Resolve a Firebase UID to the internal users table row.
 * If the user doesn't exist yet, creates a new row automatically.
 * Returns the internal UUID (users.id).
 */
export async function resolveUserId(firebaseUid: string): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.firebaseUid, firebaseUid),
    columns: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(users)
    .values({ firebaseUid })
    .returning({ id: users.id });

  if (!created) {
    throw new Error("Failed to create user record");
  }

  return created.id;
}
