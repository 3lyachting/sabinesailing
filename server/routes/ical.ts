import { Router } from "express";
import ical from "node-ical";
import { eq, gte } from "drizzle-orm";
import { getDb } from "../db";
import { config, disponibilites } from "../../drizzle/schema";

const router = Router();

const ICAL_KEY = "google_ical_url";

function isConfigTableMissingError(err: unknown): boolean {
  const message = String((err as any)?.message || err || "").toLowerCase();
  return (
    message.includes('from "config"') ||
    message.includes('relation "config"') ||
    message.includes("config does not exist")
  );
}

// Cache simple en mémoire (5 min) pour éviter de hammerer Google
let cacheData: any[] | null = null;
let cacheTs = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const escapeIcs = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

const toIcsDateTime = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/**
 * Détecte la destination depuis le résumé/description/localisation d'un événement.
 */
function detectDestination(text: string): string {
  const t = (text || "").toLowerCase();
  if (/antille|martinique|grenadin|caraib|caribb|guadeloupe|saintes/.test(t)) {
    return "Antilles";
  }
  if (/atlantique|atlantic|transat|traverse/.test(t)) {
    return "Traversée Atlantique";
  }
  if (/corse|sardaig|mediter|mediterr|baleare|italie/.test(t)) {
    return "Méditerranée";
  }
  return "Méditerranée"; // par défaut
}

/**
 * Détecte le statut depuis le résumé (ex: "Réservé", "Option", "Dispo").
 */
function detectStatut(summary: string): "disponible" | "reserve" | "option" | "ferme" {
  const s = (summary || "").toLowerCase();
  if (/reserv|booked|confirm|vendu/.test(s)) return "reserve";
  if (/option|pending|tentative/.test(s)) return "option";
  if (/ferme|fermé|closed|indispo/.test(s)) return "ferme";
  return "disponible";
}

/**
 * Extrait un tarif numérique depuis le texte (ex : "9500€", "8 500 EUR").
 */
function detectTarif(text: string): number | null {
  if (!text) return null;
  const match = text.match(/(\d[\d\s]{2,})\s*(€|euros?|EUR)/i);
  if (match) {
    const num = parseInt(match[1].replace(/\s/g, ""), 10);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * GET /api/ical/events — retourne les événements parsés depuis le Google Agenda.
 * Si aucune URL iCal n'est configurée, retourne un tableau vide.
 */
router.get("/events", async (_req, res) => {
  try {
    // Cache
    if (cacheData && Date.now() - cacheTs < CACHE_TTL_MS) {
      return res.json(cacheData);
    }

    const db = await getDb();
    if (!db) return res.json([]);

    const [row] = await db.select().from(config).where(eq(config.cle, ICAL_KEY)).limit(1);
    const url = row?.valeur;
    if (!url) return res.json([]);

    // Utiliser fromURL directement (compatible avec ES modules)
    const events = await (ical as any).async.fromURL(url);
    const parsed: any[] = [];

    for (const key in events) {
      const ev: any = (events as any)[key];
      if (!ev || ev.type !== "VEVENT") continue;
      if (!ev.start || !ev.end) continue;

      const summary = String(ev.summary || "");
      const description = String(ev.description || "");
      const location = String(ev.location || "");
      const combined = `${summary} ${description} ${location}`;

      parsed.push({
        uid: ev.uid,
        titre: summary,
        description,
        debut: new Date(ev.start).toISOString(),
        fin: new Date(ev.end).toISOString(),
        destination: detectDestination(combined),
        statut: detectStatut(summary),
        tarif: detectTarif(combined),
        source: "google-ical",
      });
    }

    parsed.sort((a, b) => new Date(a.debut).getTime() - new Date(b.debut).getTime());

    cacheData = parsed;
    cacheTs = Date.now();
    res.json(parsed);
  } catch (err: any) {
    if (isConfigTableMissingError(err)) {
      return res.json([]);
    }
    console.error("[iCal] Erreur:", err?.message || err);
    res.status(500).json({ error: err?.message || "Erreur iCal" });
  }
});

/**
 * Force le refresh du cache iCal.
 */
router.post("/refresh", async (_req, res) => {
  cacheData = null;
  cacheTs = 0;
  res.json({ ok: true, message: "Cache iCal vidé, prochain appel rechargera depuis Google" });
});

/**
 * GET/PUT config iCal URL.
 */
router.get("/config", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.json({ url: "", exportUrl: "/api/ical/export.ics" });
    const [row] = await db.select().from(config).where(eq(config.cle, ICAL_KEY)).limit(1);
    const origin = `${_req.protocol}://${_req.get("host")}`;
    res.json({
      url: row?.valeur || "",
      exportUrl: `${origin}/api/ical/export.ics`,
    });
  } catch (err: any) {
    if (isConfigTableMissingError(err)) {
      const origin = `${_req.protocol}://${_req.get("host")}`;
      return res.json({
        url: "",
        exportUrl: `${origin}/api/ical/export.ics`,
      });
    }
    return res.status(500).json({ error: err?.message || "Erreur lecture config iCal" });
  }
});

router.put("/config", async (req, res) => {
  try {
    const { url } = req.body || {};
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB indisponible" });

    const [existing] = await db.select().from(config).where(eq(config.cle, ICAL_KEY)).limit(1);
    if (existing) {
      await db.update(config).set({ valeur: url || "" }).where(eq(config.cle, ICAL_KEY));
    } else {
      await db.insert(config).values({
        cle: ICAL_KEY,
        valeur: url || "",
        description: "URL iCal secrète du Google Agenda Sabine Sailing",
      });
    }
    cacheData = null;
    cacheTs = 0;
    res.json({ ok: true });
  } catch (err: any) {
    if (isConfigTableMissingError(err)) {
      return res.status(503).json({ error: "Table config absente. Lancez la migration base de donnees." });
    }
    return res.status(500).json({ error: err?.message || "Erreur ecriture config iCal" });
  }
});

/**
 * GET /api/ical/export.ics — exporte le planning interne en iCal.
 */
router.get("/export.ics", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).send("DB indisponible");

    const now = new Date();
    const events = await db
      .select()
      .from(disponibilites)
      .where(gte(disponibilites.fin, now))
      .orderBy(disponibilites.debut);

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sabine Sailing//Planning Export//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Sabine Sailing Planning",
      "X-WR-TIMEZONE:UTC",
    ];

    for (const ev of events) {
      const title = `[${ev.planningType}] ${ev.destination} - ${ev.statut}`;
      const descriptionParts = [
        `Type: ${ev.planningType}`,
        `Statut: ${ev.statut}`,
        ev.notePublique ? `Public: ${ev.notePublique}` : "",
        ev.note ? `Prive: ${ev.note}` : "",
      ].filter(Boolean);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:dispo-${ev.id}@sabine-sailing.com`);
      lines.push(`DTSTAMP:${toIcsDateTime(new Date())}`);
      lines.push(`DTSTART:${toIcsDateTime(new Date(ev.debut))}`);
      lines.push(`DTEND:${toIcsDateTime(new Date(ev.fin))}`);
      lines.push(`SUMMARY:${escapeIcs(title)}`);
      lines.push(`DESCRIPTION:${escapeIcs(descriptionParts.join("\n"))}`);
      lines.push(`LOCATION:${escapeIcs(ev.destination)}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", "inline; filename=\"sabine-planning.ics\"");
    return res.send(lines.join("\r\n"));
  } catch (err: any) {
    console.error("[iCal export] Erreur:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Erreur export iCal" });
  }
});

export default router;
