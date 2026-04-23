import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users, cabinesReservees } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Récupère ou crée un enregistrement de cabines réservées pour une disponibilité
 */
export async function getOrCreateCabinesReservees(
  db: any,
  disponibiliteId: number,
  nbTotal: number = 4
) {
  let result = await db
    .select()
    .from(cabinesReservees)
    .where(eq(cabinesReservees.disponibiliteId, disponibiliteId))
    .limit(1);

  if (result.length === 0) {
    await db.insert(cabinesReservees).values({
      disponibiliteId,
      nbReservees: 0,
      nbTotal,
    });
    result = await db
      .select()
      .from(cabinesReservees)
      .where(eq(cabinesReservees.disponibiliteId, disponibiliteId))
      .limit(1);
  }

  return result[0];
}

/**
 * Met à jour le nombre de cabines réservées
 */
export async function updateCabinesReservees(
  db: any,
  disponibiliteId: number,
  nbReservees: number,
  notes?: string
) {
  return db
    .update(cabinesReservees)
    .set({
      nbReservees,
      notes,
      updatedAt: new Date(),
    })
    .where(eq(cabinesReservees.disponibiliteId, disponibiliteId));
}

/**
 * Récupère les cabines réservées pour une disponibilité
 */
export async function getCabinesReservees(db: any, disponibiliteId: number) {
  const result = await db
    .select()
    .from(cabinesReservees)
    .where(eq(cabinesReservees.disponibiliteId, disponibiliteId))
    .limit(1);
  return result[0] || null;
}
