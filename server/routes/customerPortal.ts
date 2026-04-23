import { Router } from "express";
import { jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { parse as parseCookie } from "cookie";
import { getDb } from "../db";
import { customers, documents, reservations } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { storagePut } from "../storage";

const router = Router();
const CUSTOMER_COOKIE = "customer_session_id";

async function getCustomerEmailFromRequest(req: any): Promise<string | null> {
  try {
    const cookies = parseCookie(req.headers.cookie || "");
    const token = cookies[CUSTOMER_COOKIE];
    if (!token) return null;
    const secret = new TextEncoder().encode(ENV.cookieSecret || "dev-secret");
    const payload = (await jwtVerify(token, secret)).payload as { email?: string; type?: string };
    if (!payload?.email || payload.type !== "customer") return null;
    return payload.email;
  } catch {
    return null;
  }
}

router.get("/reservations", async (req, res) => {
  try {
    const email = await getCustomerEmailFromRequest(req);
    if (!email) return res.status(401).json({ error: "Non connecté" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    const rows = await db.select().from(reservations).where(eq(reservations.emailClient, email));
    return res.json(rows);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur chargement réservations" });
  }
});

router.get("/documents", async (req, res) => {
  try {
    const email = await getCustomerEmailFromRequest(req);
    if (!email) return res.status(401).json({ error: "Non connecté" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });
    const customer = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (!customer.length) return res.json([]);
    const docs = await db.select().from(documents).where(eq(documents.customerId, customer[0].id));
    return res.json(docs);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur chargement documents" });
  }
});

router.post("/documents/upload", async (req, res) => {
  try {
    const email = await getCustomerEmailFromRequest(req);
    if (!email) return res.status(401).json({ error: "Non connecté" });
    const { reservationId, docType, originalName, mimeType, base64Data } = req.body as {
      reservationId?: number;
      docType?: string;
      originalName?: string;
      mimeType?: string;
      base64Data?: string;
    };

    if (!docType || !originalName || !mimeType || !base64Data) {
      return res.status(400).json({ error: "Données upload manquantes" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const customer = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (!customer.length) return res.status(404).json({ error: "Client introuvable" });
    const customerId = customer[0].id;

    if (reservationId) {
      const ownedReservation = await db
        .select()
        .from(reservations)
        .where(and(eq(reservations.id, reservationId), eq(reservations.emailClient, email)))
        .limit(1);
      if (!ownedReservation.length) return res.status(403).json({ error: "Réservation non autorisée" });
    }

    const buffer = Buffer.from(base64Data, "base64");
    const uploaded = await storagePut(
      `customers/${customerId}/documents/${Date.now()}-${originalName}`,
      buffer,
      mimeType
    );

    const inserted = await db
      .insert(documents)
      .values({
        reservationId: reservationId || null,
        customerId,
        category: "identity",
        docType,
        originalName,
        mimeType,
        sizeBytes: buffer.byteLength,
        storageKey: uploaded.key,
        isSensitive: true,
        uploadedByType: "customer",
        uploadedById: customerId,
      })
      .returning({ id: documents.id });

    return res.json({ success: true, documentId: inserted[0]?.id, url: uploaded.url });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur upload document" });
  }
});

export default router;
