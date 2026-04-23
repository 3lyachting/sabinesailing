import { Router } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { crewMembers, maintenanceTasks } from "../../drizzle/schema";
import { requireAdmin } from "../_core/authz";

const router = Router();
router.use(requireAdmin);

function mapDbError(error: any, fallback: string) {
  const message = String(error?.message || "");
  if (message.includes("relation") && message.includes("does not exist")) {
    return "Tables maintenance/équipage absentes en base. Lancez `pnpm drizzle-kit push` puis redémarrez le serveur.";
  }
  return error?.message || fallback;
}

router.get("/crew", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    const rows = await db.select().from(crewMembers);
    return res.json(rows);
  } catch (error: any) {
    return res.status(500).json({ error: mapDbError(error, "Erreur liste équipage") });
  }
});

router.post("/crew", async (req, res) => {
  try {
    const { fullName, role, phone, email, certifications, availabilityNote } = req.body || {};
    if (!fullName || !role) return res.status(400).json({ error: "Nom et rôle requis" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    const inserted = await db
      .insert(crewMembers)
      .values({
        fullName: String(fullName),
        role: String(role),
        phone: phone || null,
        email: email || null,
        certifications: certifications || null,
        availabilityNote: availabilityNote || null,
      })
      .returning({ id: crewMembers.id });
    return res.json({ success: true, id: inserted[0]?.id });
  } catch (error: any) {
    return res.status(500).json({ error: mapDbError(error, "Erreur création équipage") });
  }
});

router.put("/crew/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { fullName, role, phone, email, certifications, availabilityNote } = req.body || {};
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    await db
      .update(crewMembers)
      .set({
        fullName: fullName || undefined,
        role: role || undefined,
        phone: phone || undefined,
        email: email || undefined,
        certifications: certifications || undefined,
        availabilityNote: availabilityNote || undefined,
        updatedAt: new Date(),
      })
      .where(eq(crewMembers.id, id));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: mapDbError(error, "Erreur mise à jour équipage") });
  }
});

router.delete("/crew/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    await db.delete(crewMembers).where(eq(crewMembers.id, id));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: mapDbError(error, "Erreur suppression équipage") });
  }
});

router.get("/maintenance/tasks", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    const rows = await db.select().from(maintenanceTasks);
    return res.json(rows);
  } catch (error: any) {
    return res.status(500).json({ error: mapDbError(error, "Erreur liste maintenance") });
  }
});

router.post("/maintenance/tasks", async (req, res) => {
  try {
    const {
      title,
      system,
      boatArea,
      intervalHours,
      intervalDays,
      lastDoneEngineHours,
      currentEngineHours,
      lastDoneAt,
      nextDueAt,
      sparePartsLocation,
      boatPlanRef,
      procedureNote,
      isCritical,
      isDone,
    } = req.body || {};
    if (!title || !system) return res.status(400).json({ error: "Titre et système requis" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    const inserted = await db
      .insert(maintenanceTasks)
      .values({
        title: String(title),
        system: String(system),
        boatArea: boatArea || null,
        intervalHours: intervalHours ? parseInt(intervalHours, 10) : null,
        intervalDays: intervalDays ? parseInt(intervalDays, 10) : null,
        lastDoneEngineHours: lastDoneEngineHours ? parseInt(lastDoneEngineHours, 10) : null,
        currentEngineHours: currentEngineHours ? parseInt(currentEngineHours, 10) : null,
        lastDoneAt: lastDoneAt ? new Date(lastDoneAt) : null,
        nextDueAt: nextDueAt ? new Date(nextDueAt) : null,
        sparePartsLocation: sparePartsLocation || null,
        boatPlanRef: boatPlanRef || null,
        procedureNote: procedureNote || null,
        isCritical: Boolean(isCritical),
        isDone: Boolean(isDone),
      })
      .returning({ id: maintenanceTasks.id });
    return res.json({ success: true, id: inserted[0]?.id });
  } catch (error: any) {
    return res.status(500).json({ error: mapDbError(error, "Erreur création maintenance") });
  }
});

router.put("/maintenance/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const payload = req.body || {};
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    await db
      .update(maintenanceTasks)
      .set({
        title: payload.title || undefined,
        system: payload.system || undefined,
        boatArea: payload.boatArea ?? undefined,
        intervalHours: payload.intervalHours !== undefined ? (payload.intervalHours ? parseInt(payload.intervalHours, 10) : null) : undefined,
        intervalDays: payload.intervalDays !== undefined ? (payload.intervalDays ? parseInt(payload.intervalDays, 10) : null) : undefined,
        lastDoneEngineHours: payload.lastDoneEngineHours !== undefined ? (payload.lastDoneEngineHours ? parseInt(payload.lastDoneEngineHours, 10) : null) : undefined,
        currentEngineHours: payload.currentEngineHours !== undefined ? (payload.currentEngineHours ? parseInt(payload.currentEngineHours, 10) : null) : undefined,
        lastDoneAt: payload.lastDoneAt !== undefined ? (payload.lastDoneAt ? new Date(payload.lastDoneAt) : null) : undefined,
        nextDueAt: payload.nextDueAt !== undefined ? (payload.nextDueAt ? new Date(payload.nextDueAt) : null) : undefined,
        sparePartsLocation: payload.sparePartsLocation ?? undefined,
        boatPlanRef: payload.boatPlanRef ?? undefined,
        procedureNote: payload.procedureNote ?? undefined,
        isCritical: payload.isCritical !== undefined ? Boolean(payload.isCritical) : undefined,
        isDone: payload.isDone !== undefined ? Boolean(payload.isDone) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceTasks.id, id));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: mapDbError(error, "Erreur mise à jour maintenance") });
  }
});

router.delete("/maintenance/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    await db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, id));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: mapDbError(error, "Erreur suppression maintenance") });
  }
});

export default router;
