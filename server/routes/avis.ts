import { Router } from "express";
import { getDb } from "../db";
import { avis } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const router = Router();

// GET tous les avis approuvés (publics)
router.get("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }

    const all = await db
      .select()
      .from(avis)
      .where(eq(avis.approuve, true))
      .orderBy(avis.createdAt);

    res.json(all);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération des avis" });
  }
});

// GET tous les avis (admin)
router.get("/admin/all", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }

    const all = await db.select().from(avis).orderBy(avis.createdAt);

    res.json(all);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération des avis" });
  }
});

// POST créer un nouvel avis
router.post("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }

    const { nom, email, note, titre, contenu, destination } = req.body;

    if (!nom || !email || !note || !titre || !contenu) {
      return res.status(400).json({ error: "Champs requis manquants" });
    }

    if (note < 1 || note > 5) {
      return res.status(400).json({ error: "La note doit être entre 1 et 5" });
    }

    const result = await db.insert(avis).values({
      nom,
      email,
      note: parseInt(note),
      titre,
      contenu,
      destination: destination || null,
      approuve: false, // Modération par défaut
    });

    res.status(201).json({ success: true, message: "Avis envoyé avec succès. Il sera publié après modération." });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la création de l'avis" });
  }
});

// PUT approuver/rejeter un avis (admin)
router.put("/:id", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }

    const { id } = req.params;
    const { approuve } = req.body;

    await db
      .update(avis)
      .set({
        approuve: approuve === true,
        updatedAt: new Date(),
      })
      .where(eq(avis.id, parseInt(id)));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la mise à jour de l'avis" });
  }
});

// DELETE supprimer un avis (admin)
router.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }

    const { id } = req.params;

    await db.delete(avis).where(eq(avis.id, parseInt(id)));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la suppression de l'avis" });
  }
});

export default router;
