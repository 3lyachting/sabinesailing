import { Router } from "express";
import { getDb } from "../db";
import { disponibilites, reservations } from "../../drizzle/schema";
import { eq, and, gte, inArray, lte } from "drizzle-orm";
import { requireAdmin } from "../_core/authz";

const router = Router();

async function syncDisponibilitesFromReservations(db: any) {
  const allDispos = await db.select().from(disponibilites);
  const allReservations = await db.select().from(reservations);

  const findBestDisponibiliteForReservation = (r: any) => {
    const rStart = new Date(r.dateDebut).toISOString().slice(0, 10);
    const rEnd = new Date(r.dateFin).toISOString().slice(0, 10);
    const exact = allDispos.find((d: any) => {
      const dStart = new Date(d.debut).toISOString().slice(0, 10);
      const dEnd = new Date(d.fin).toISOString().slice(0, 10);
      return dStart === rStart && dEnd === rEnd;
    });
    if (exact) return exact;
    const rStartMs = new Date(r.dateDebut).getTime();
    const rEndMs = new Date(r.dateFin).getTime();
    return allDispos.find((d: any) => {
      const dStartMs = new Date(d.debut).getTime();
      const dEndMs = new Date(d.fin).getTime();
      // chevauchement strict (évite de matcher la semaine juste avant sur samedi charnière)
      return rStartMs < dEndMs && rEndMs > dStartMs;
    });
  };

  // Auto-répare les liaisons réservation->disponibilité si incohérentes avec les dates.
  for (const r of allReservations) {
    const best = findBestDisponibiliteForReservation(r);
    if (best?.id && r.disponibiliteId !== best.id) {
      await db
        .update(reservations)
        .set({
          disponibiliteId: best.id,
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, r.id));
      r.disponibiliteId = best.id;
    }
  }

  for (const dispo of allDispos) {
    // Ne jamais écraser les créneaux non commerciaux (maintenance / arrêt technique / blocage).
    if (dispo.planningType && dispo.planningType !== "charter") {
      if (dispo.statut !== "ferme" || (dispo.cabinesReservees || 0) !== 0) {
        await db
          .update(disponibilites)
          .set({
            statut: "ferme",
            cabinesReservees: 0,
            updatedAt: new Date(),
          })
          .where(eq(disponibilites.id, dispo.id));
      }
      continue;
    }

    const bookedReservations = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.disponibiliteId, dispo.id),
          inArray(reservations.workflowStatut, ["contrat_signe", "acompte_confirme", "solde_confirme"])
        )
      );

    const hasPrivate = bookedReservations.some((r: any) => r.typeReservation === "bateau_entier");
    const reservedCabins = hasPrivate
      ? dispo.capaciteTotale
      : bookedReservations
          .filter((r: any) => r.typeReservation === "cabine" || r.typeReservation === "place")
          .reduce((sum: number, r: any) => sum + Math.max(1, r.nbCabines || 1), 0);
    const clampedReservedCabins = Math.max(0, Math.min(dispo.capaciteTotale || 4, reservedCabins));

    let statut: "disponible" | "option" | "reserve" = "disponible";
    if (hasPrivate || clampedReservedCabins >= (dispo.capaciteTotale || 4)) statut = "reserve";
    else if (clampedReservedCabins > 0) statut = "option";

    if (dispo.statut !== statut || (dispo.cabinesReservees || 0) !== clampedReservedCabins) {
      await db
        .update(disponibilites)
        .set({
          statut,
          cabinesReservees: clampedReservedCabins,
          updatedAt: new Date(),
        })
        .where(eq(disponibilites.id, dispo.id));
    }
  }
}

// GET toutes les disponibilités
router.get("/", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }
    await syncDisponibilitesFromReservations(db);
    const all = await db.select().from(disponibilites).orderBy(disponibilites.debut);
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération des disponibilités" });
  }
});

// GET disponibilités pour une période donnée
router.get("/range", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }
    await syncDisponibilitesFromReservations(db);
    const { debut, fin } = req.query;
    if (!debut || !fin) {
      return res.status(400).json({ error: "Paramètres debut et fin requis" });
    }
    
    const debutDate = new Date(debut as string);
    const finDate = new Date(fin as string);
    
    const result = await db
      .select()
      .from(disponibilites)
      .where(
        and(
          gte(disponibilites.debut, debutDate),
          lte(disponibilites.fin, finDate)
        )
      )
      .orderBy(disponibilites.debut);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la récupération des disponibilités" });
  }
});

// POST créer une nouvelle disponibilité
router.post("/", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }
    
    const {
      planningType,
      debut,
      fin,
      statut,
      tarif,
      tarifCabine,
      tarifJourPersonne,
      tarifJourPriva,
      destination,
      note,
      notePublique,
    } = req.body;
    
    if (!debut || !fin || !statut || !destination) {
      return res.status(400).json({ error: "Champs requis manquants" });
    }
    
    const result = await db.insert(disponibilites).values({
      planningType: planningType || "charter",
      debut: new Date(debut),
      fin: new Date(fin),
      statut,
      tarif: tarif ? parseInt(tarif) : null,
      tarifCabine: tarifCabine ? parseInt(tarifCabine) : null,
      tarifJourPersonne: tarifJourPersonne ? parseInt(tarifJourPersonne) : null,
      tarifJourPriva: tarifJourPriva ? parseInt(tarifJourPriva) : null,
      destination,
      note: note || null,
      notePublique: notePublique || null,
    });
    
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la création de la disponibilité" });
  }
});

// PUT mettre à jour une disponibilité
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }
    
    const { id } = req.params;
    const {
      planningType,
      debut,
      fin,
      statut,
      tarif,
      tarifCabine,
      tarifJourPersonne,
      tarifJourPriva,
      destination,
      note,
      notePublique,
    } = req.body;
    
    await db
      .update(disponibilites)
      .set({
        planningType: planningType || undefined,
        debut: debut ? new Date(debut) : undefined,
        fin: fin ? new Date(fin) : undefined,
        statut: statut || undefined,
        tarif: tarif ? parseInt(tarif) : undefined,
        tarifCabine: tarifCabine ? parseInt(tarifCabine) : undefined,
        tarifJourPersonne: tarifJourPersonne ? parseInt(tarifJourPersonne) : undefined,
        tarifJourPriva: tarifJourPriva ? parseInt(tarifJourPriva) : undefined,
        destination: destination || undefined,
        note: note || undefined,
        notePublique: notePublique || undefined,
        updatedAt: new Date(),
      })
      .where(eq(disponibilites.id, parseInt(id)));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la mise à jour de la disponibilité" });
  }
});

// DELETE supprimer une disponibilité
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }
    
    const { id } = req.params;
    
    await db.delete(disponibilites).where(eq(disponibilites.id, parseInt(id)));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la suppression de la disponibilité" });
  }
});

export default router;
