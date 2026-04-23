import { Router } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { cabinesReservees } from "../../drizzle/schema";
import { requireAdmin } from "../_core/authz";

const router = Router();

/**
 * GET /api/cabines-reservees — Récupère toutes les cabines réservées
 */
router.get("/", requireAdmin, async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const result = await db.select().from(cabinesReservees);
    res.json(result);
  } catch (err: any) {
    console.error("[Cabines] Erreur:", err?.message || err);
    res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});

/**
 * GET /api/cabines-reservees/:disponibiliteId — Récupère les cabines pour une disponibilité
 */
router.get("/:disponibiliteId", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const disponibiliteId = parseInt(req.params.disponibiliteId);
    const result = await db
      .select()
      .from(cabinesReservees)
      .where(eq(cabinesReservees.disponibiliteId, disponibiliteId))
      .limit(1);

    res.json(result[0] || null);
  } catch (err: any) {
    console.error("[Cabines] Erreur:", err?.message || err);
    res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});

/**
 * POST /api/cabines-reservees — Crée ou met à jour les cabines réservées
 */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { disponibiliteId, nbReservees, nbTotal, notes } = req.body;

    if (!disponibiliteId || nbReservees === undefined || nbTotal === undefined) {
      return res.status(400).json({ error: "Paramètres manquants" });
    }

    // Vérifier si l'enregistrement existe
    const existing = await db
      .select()
      .from(cabinesReservees)
      .where(eq(cabinesReservees.disponibiliteId, disponibiliteId))
      .limit(1);

    if (existing.length > 0) {
      // Mise à jour
      await db
        .update(cabinesReservees)
        .set({
          nbReservees,
          nbTotal,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(eq(cabinesReservees.disponibiliteId, disponibiliteId));
    } else {
      // Création
      await db.insert(cabinesReservees).values({
        disponibiliteId,
        nbReservees,
        nbTotal,
        notes: notes || null,
      });
    }

    res.json({ ok: true, message: "Cabines réservées mises à jour" });
  } catch (err: any) {
    console.error("[Cabines] Erreur:", err?.message || err);
    res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});

export default router;
