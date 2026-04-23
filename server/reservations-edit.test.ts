import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { reservations } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Reservations - Edit & Delete", () => {
  let testReservationId: number;
  let dbAvailable = false;

  beforeAll(async () => {
    // Créer une réservation de test
    const db = await getDb();
    if (!db) {
      dbAvailable = false;
      return;
    }
    dbAvailable = true;

    const inserted = await db.insert(reservations).values({
      nomClient: "Test User",
      emailClient: "test@example.com",
      telClient: "0123456789",
      nbPersonnes: 2,
      formule: "semaine",
      destination: "Méditerranée",
      dateDebut: new Date("2026-06-06"),
      dateFin: new Date("2026-06-13"),
      montantTotal: 500000, // 5000€
      typePaiement: "acompte",
      montantPaye: 0,
      typeReservation: "bateau_entier",
      nbCabines: 1,
      message: "Test message",
      disponibiliteId: null,
      statutPaiement: "en_attente",
    }).returning({ id: reservations.id });

    testReservationId = inserted[0].id;
  });

  afterAll(async () => {
    // Nettoyer la réservation de test
    const db = await getDb();
    if (!db) return;
    await db.delete(reservations).where(eq(reservations.id, testReservationId));
  });

  it("should fetch a reservation by ID", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const result = await db.select().from(reservations).where(eq(reservations.id, testReservationId));

    expect(result).toHaveLength(1);
    expect(result[0].nomClient).toBe("Test User");
    expect(result[0].emailClient).toBe("test@example.com");
  });

  it("should update a reservation", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    await db
      .update(reservations)
      .set({
        nomClient: "Updated User",
        nbPersonnes: 4,
        montantTotal: 800000,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, testReservationId));

    const result = await db.select().from(reservations).where(eq(reservations.id, testReservationId));

    expect(result[0].nomClient).toBe("Updated User");
    expect(result[0].nbPersonnes).toBe(4);
    expect(result[0].montantTotal).toBe(800000);
  });

  it("should handle partial updates", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const before = await db.select().from(reservations).where(eq(reservations.id, testReservationId));

    await db
      .update(reservations)
      .set({
        statutPaiement: "paye",
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, testReservationId));

    const after = await db.select().from(reservations).where(eq(reservations.id, testReservationId));

    expect(after[0].statutPaiement).toBe("paye");
    expect(after[0].nomClient).toBe(before[0].nomClient); // Unchanged
    expect(after[0].emailClient).toBe(before[0].emailClient); // Unchanged
  });

  it("should delete a reservation", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    // Créer une réservation temporaire à supprimer
    const inserted = await db.insert(reservations).values({
      nomClient: "Delete Test",
      emailClient: "delete@example.com",
      telClient: null,
      nbPersonnes: 1,
      formule: "journee",
      destination: "Antilles",
      dateDebut: new Date("2026-07-01"),
      dateFin: new Date("2026-07-02"),
      montantTotal: 100000,
      typePaiement: "complet",
      montantPaye: 0,
      typeReservation: "place",
      nbCabines: 1,
      message: null,
      disponibiliteId: null,
      statutPaiement: "en_attente",
    }).returning({ id: reservations.id });

    const deleteId = inserted[0].id;

    // Vérifier qu'elle existe
    const before = await db.select().from(reservations).where(eq(reservations.id, deleteId));
    expect(before).toHaveLength(1);

    // Supprimer
    await db.delete(reservations).where(eq(reservations.id, deleteId));

    // Vérifier qu'elle n'existe plus
    const after = await db.select().from(reservations).where(eq(reservations.id, deleteId));
    expect(after).toHaveLength(0);
  });

  it("should list all reservations", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const all = await db.select().from(reservations);

    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });
});
