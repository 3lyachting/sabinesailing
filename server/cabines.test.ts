import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "./db";
import { cabinesReservees } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Cabines Réservées", () => {
  let db: any;
  let testDisponibiliteId = 999;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      console.warn("Database not available for tests");
    }
  });

  it("should create cabines réservées", async () => {
    if (!db) {
      console.warn("Skipping test: database not available");
      return;
    }

    // Créer un enregistrement
    await db.insert(cabinesReservees).values({
      disponibiliteId: testDisponibiliteId,
      nbReservees: 2,
      nbTotal: 4,
      notes: "2 cabines doubles réservées",
    });

    // Vérifier qu'il a été créé
    const result = await db
      .select()
      .from(cabinesReservees)
      .where(eq(cabinesReservees.disponibiliteId, testDisponibiliteId))
      .limit(1);

    expect(result).toHaveLength(1);
    expect(result[0].nbReservees).toBe(2);
    expect(result[0].nbTotal).toBe(4);
    expect(result[0].notes).toBe("2 cabines doubles réservées");
  });

  it("should update cabines réservées", async () => {
    if (!db) {
      console.warn("Skipping test: database not available");
      return;
    }

    // Mettre à jour l'enregistrement
    await db
      .update(cabinesReservees)
      .set({
        nbReservees: 3,
        notes: "3 cabines doubles réservées",
        updatedAt: new Date(),
      })
      .where(eq(cabinesReservees.disponibiliteId, testDisponibiliteId));

    // Vérifier la mise à jour
    const result = await db
      .select()
      .from(cabinesReservees)
      .where(eq(cabinesReservees.disponibiliteId, testDisponibiliteId))
      .limit(1);

    expect(result[0].nbReservees).toBe(3);
    expect(result[0].notes).toBe("3 cabines doubles réservées");
  });

  it("should calculate available cabines", async () => {
    if (!db) {
      console.warn("Skipping test: database not available");
      return;
    }

    const result = await db
      .select()
      .from(cabinesReservees)
      .where(eq(cabinesReservees.disponibiliteId, testDisponibiliteId))
      .limit(1);

    const cabine = result[0];
    const available = cabine.nbTotal - cabine.nbReservees;

    expect(available).toBe(1); // 4 total - 3 réservées = 1 disponible
  });

  it("should delete cabines réservées", async () => {
    if (!db) {
      console.warn("Skipping test: database not available");
      return;
    }

    // Supprimer l'enregistrement
    await db
      .delete(cabinesReservees)
      .where(eq(cabinesReservees.disponibiliteId, testDisponibiliteId));

    // Vérifier la suppression
    const result = await db
      .select()
      .from(cabinesReservees)
      .where(eq(cabinesReservees.disponibiliteId, testDisponibiliteId));

    expect(result).toHaveLength(0);
  });
});
