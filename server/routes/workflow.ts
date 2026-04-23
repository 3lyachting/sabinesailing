import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { requireAdmin } from "../_core/authz";
import { ENV } from "../_core/env";
import {
  contracts,
  disponibilites,
  invoices,
  quotes,
  reservations,
  reservationStatusHistory,
  esignEvents,
} from "../../drizzle/schema";
import { buildInvoicePdf, buildQuoteContractPdf } from "../_core/commercialDocs";
import { dispatchEsign } from "../_core/esign";
import { storageGetSignedUrl } from "../storage";

const router = Router();

const nowYear = () => new Date().getUTCFullYear();
const pad = (n: number) => String(n).padStart(4, "0");

const buildQuoteNumber = (id: number) => `DV-${nowYear()}-${pad(id)}`;
const buildContractNumber = (id: number) => `CT-${nowYear()}-${pad(id)}`;
const buildInvoiceNumber = (id: number, type: "acompte" | "solde" | "full") =>
  `FAC-${type.toUpperCase()}-${nowYear()}-${pad(id)}`;

async function resolveDisponibiliteIdForReservation(db: any, r: any): Promise<number | null> {
  if (r.disponibiliteId) return r.disponibiliteId;
  const rows = await db.select().from(disponibilites);
  const reservationStart = new Date(r.dateDebut).toISOString().slice(0, 10);
  const reservationEnd = new Date(r.dateFin).toISOString().slice(0, 10);
  let match = rows.find((d: any) => {
    const dStart = new Date(d.debut).toISOString().slice(0, 10);
    const dEnd = new Date(d.fin).toISOString().slice(0, 10);
    return dStart === reservationStart && dEnd === reservationEnd;
  });
  if (!match) {
    // Fallback robuste: chevauchement de période (utile si les heures diffèrent).
    const rStartMs = new Date(r.dateDebut).getTime();
    const rEndMs = new Date(r.dateFin).getTime();
    match = rows.find((d: any) => {
      const dStartMs = new Date(d.debut).getTime();
      const dEndMs = new Date(d.fin).getTime();
      return rStartMs < dEndMs && rEndMs > dStartMs;
    });
  }
  if (!match?.id) return null;
  await db
    .update(reservations)
    .set({ disponibiliteId: match.id, updatedAt: new Date() })
    .where(eq(reservations.id, r.id));
  return match.id;
}

async function refreshDisponibiliteBookingState(db: any, disponibiliteId: number) {
  const dispoRows = await db.select().from(disponibilites).where(eq(disponibilites.id, disponibiliteId)).limit(1);
  const dispo = dispoRows[0];
  if (!dispo) return;
  if (dispo.planningType && dispo.planningType !== "charter") {
    await db
      .update(disponibilites)
      .set({
        statut: "ferme",
        cabinesReservees: 0,
        updatedAt: new Date(),
      })
      .where(eq(disponibilites.id, disponibiliteId));
    return;
  }

  const bookedReservations = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.disponibiliteId, disponibiliteId),
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
  if (hasPrivate || clampedReservedCabins >= (dispo.capaciteTotale || 4)) {
    statut = "reserve";
  } else if (clampedReservedCabins > 0) {
    statut = "option";
  }

  await db
    .update(disponibilites)
    .set({
      statut,
      cabinesReservees: clampedReservedCabins,
      updatedAt: new Date(),
    })
    .where(eq(disponibilites.id, disponibiliteId));
}

router.post("/reservations/:id/owner-validate", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const existing = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "Réservation introuvable" });
    const r = existing[0];
    const optionExpiresAt = new Date();
    optionExpiresAt.setUTCDate(optionExpiresAt.getUTCDate() + 7);

    const acompteMontant = Math.round((r.montantTotal * 20) / 100);
    const soldeMontant = Math.max(0, r.montantTotal - acompteMontant);
    const soldeEcheanceAt = new Date(r.dateDebut);
    soldeEcheanceAt.setUTCDate(soldeEcheanceAt.getUTCDate() - 45);

    await db
      .update(reservations)
      .set({
        workflowStatut: "validee_owner",
        acomptePercent: 20,
        acompteMontant,
        soldeMontant,
        soldeEcheanceAt,
        ownerValidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));

    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, r);
    if (linkedDisponibiliteId) {
      await db
        .update(disponibilites)
        .set({
          statut: "option",
          updatedAt: new Date(),
        })
        .where(eq(disponibilites.id, linkedDisponibiliteId));
    }

    const quoteNumber = buildQuoteNumber(reservationId);
    const contractNumber = buildContractNumber(reservationId);
    const combinedPdf = await buildQuoteContractPdf(r, quoteNumber, contractNumber, optionExpiresAt);
    const combinedFile = await storagePut(
      `commercial/combined/devis-contrat-${reservationId}.pdf`,
      combinedPdf,
      "application/pdf"
    );

    const existingQuotes = await db.select().from(quotes).where(eq(quotes.reservationId, reservationId));
    let quoteId: number | null = null;
    if (existingQuotes.length) {
      const existingQuote = existingQuotes.slice().sort((a, b) => b.id - a.id)[0];
      await db
        .update(quotes)
        .set({
          quoteNumber,
          totalAmount: r.montantTotal,
          currency: "EUR",
          pdfStorageKey: combinedFile.key,
        })
        .where(eq(quotes.id, existingQuote.id));
      quoteId = existingQuote.id;
    } else {
      const quoteInsert = await db
        .insert(quotes)
        .values({
          reservationId,
          quoteNumber,
          totalAmount: r.montantTotal,
          currency: "EUR",
          pdfStorageKey: combinedFile.key,
        })
        .returning({ id: quotes.id });
      quoteId = quoteInsert[0]?.id ?? null;
    }

    const existingContracts = await db.select().from(contracts).where(eq(contracts.reservationId, reservationId));
    let createdContract: { id: number; contractNumber: string; pdfStorageKey: string | null };
    if (existingContracts.length) {
      const existingContract = existingContracts.slice().sort((a, b) => b.id - a.id)[0];
      await db
        .update(contracts)
        .set({
          quoteId,
          contractNumber,
          pdfStorageKey: combinedFile.key,
        })
        .where(eq(contracts.id, existingContract.id));
      createdContract = {
        id: existingContract.id,
        contractNumber,
        pdfStorageKey: combinedFile.key,
      };
    } else {
      const contractInsert = await db
        .insert(contracts)
        .values({
          reservationId,
          quoteId,
          contractNumber,
          pdfStorageKey: combinedFile.key,
          esignProvider: "other",
        })
        .returning({ id: contracts.id, contractNumber: contracts.contractNumber, pdfStorageKey: contracts.pdfStorageKey });
      createdContract = contractInsert[0];
    }
    await db
      .update(reservations)
      .set({
        workflowStatut: "validee_owner",
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));

    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "validee_owner",
      actorType: "admin",
      note: "Réservation validée par le propriétaire. Devis et contrat générés (en attente d'envoi).",
    });

    return res.json({
      success: true,
      acompteMontant,
      soldeMontant,
      soldeEcheanceAt,
      optionExpiresAt,
      quoteUrl: combinedFile.url,
      contractUrl: combinedFile.url,
      contractId: createdContract.id,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur workflow owner validation" });
  }
});

router.post("/reservations/:id/send-contract", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const existing = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "Réservation introuvable" });
    const r = existing[0];

    const contractRows = await db.select().from(contracts).where(eq(contracts.reservationId, reservationId));
    if (!contractRows.length) {
      return res.status(400).json({ error: "Aucun contrat généré. Validez d'abord la réservation." });
    }
    const contract = contractRows.slice().sort((a, b) => b.id - a.id)[0];
    if (!contract.pdfStorageKey) {
      return res.status(400).json({ error: "Contrat sans fichier PDF." });
    }

    let esignProvider: "yousign" | "docusign" | "other" = "other";
    let esignEnvelopeId = `manual-${reservationId}-${Date.now()}`;
    let signUrl: string | null = null;
    let sentAt: Date | null = null;

    try {
      const signedUrl = await storageGetSignedUrl(contract.pdfStorageKey);
      const webhookBase = `${req.protocol}://${req.get("host")}`;
      const result = await dispatchEsign({
        contractNumber: contract.contractNumber,
        signerName: r.nomClient,
        signerEmail: r.emailClient,
        contractDownloadUrl: signedUrl,
        webhookUrl: `${webhookBase}/api/workflow/esign/webhook`,
      });
      esignProvider = result.provider;
      esignEnvelopeId = result.envelopeId;
      signUrl = result.signUrl;
      sentAt = result.sentAt;
    } catch {
      esignProvider = "other";
      esignEnvelopeId = `manual-${reservationId}-${Date.now()}`;
      sentAt = new Date();
    }

    await db
      .update(contracts)
      .set({
        esignProvider,
        esignEnvelopeId,
        sentAt,
      })
      .where(eq(contracts.id, contract.id));

    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, r);
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState(db, linkedDisponibiliteId);
    }

    await db
      .update(reservations)
      .set({
        workflowStatut: "contrat_envoye",
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));

    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "contrat_envoye",
      actorType: "admin",
      note: "Contrat envoyé au client pour signature.",
    });

    return res.json({
      success: true,
      esign: {
        provider: esignProvider,
        envelopeId: esignEnvelopeId,
        signUrl,
        webhookUrl: "/api/workflow/esign/webhook",
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur envoi contrat" });
  }
});

router.post("/reservations/:id/acompte-received", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const existing = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "Réservation introuvable" });
    const r = existing[0];

    const acompteAmount = r.acompteMontant || Math.round((r.montantTotal * 20) / 100);

    // Toggle: si déjà confirmé, un second clic annule la confirmation d'acompte.
    if (r.workflowStatut === "acompte_confirme") {
      const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, r);
      await db
        .update(reservations)
        .set({
          workflowStatut: "contrat_envoye",
          montantPaye: 0,
          statutPaiement: "en_attente",
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, reservationId));
      if (linkedDisponibiliteId) {
        await db
          .update(disponibilites)
          .set({
            statut: "option",
            updatedAt: new Date(),
          })
          .where(eq(disponibilites.id, linkedDisponibiliteId));
      }

      await db.insert(reservationStatusHistory).values({
        reservationId,
        fromStatut: "acompte_confirme",
        toStatut: "contrat_envoye",
        actorType: "admin",
        note: "Annulation de la confirmation d'acompte (second clic).",
      });
      if (linkedDisponibiliteId) {
        await refreshDisponibiliteBookingState(db, linkedDisponibiliteId);
      }

      return res.json({ success: true, cancelled: true, acompteAmount: 0, invoiceUrl: null });
    }

    await db
      .update(reservations)
      .set({
        workflowStatut: "acompte_confirme",
        montantPaye: acompteAmount,
        statutPaiement: "en_attente",
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, r);
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState(db, linkedDisponibiliteId);
    }

    const existingAcompteInvoice = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.reservationId, reservationId), eq(invoices.invoiceType, "acompte")))
      .limit(1);

    let invoiceUrl: string | null = null;
    if (existingAcompteInvoice.length) {
      invoiceUrl = existingAcompteInvoice[0].pdfStorageKey
        ? await storageGetSignedUrl(existingAcompteInvoice[0].pdfStorageKey).catch(() => null)
        : null;
    } else {
      const invoiceNumber = buildInvoiceNumber(reservationId, "acompte");
      const invoicePdf = await buildInvoicePdf(r, invoiceNumber, "acompte", acompteAmount, new Date());
      const invoiceFile = await storagePut(
        `commercial/invoices/invoice-acompte-${reservationId}.pdf`,
        invoicePdf,
        "application/pdf"
      );

      await db.insert(invoices).values({
        reservationId,
        invoiceNumber,
        invoiceType: "acompte",
        amount: acompteAmount,
        currency: "EUR",
        dueAt: new Date(),
        paidAt: new Date(),
        pdfStorageKey: invoiceFile.key,
      });
      invoiceUrl = invoiceFile.url;
    }

    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "acompte_confirme",
      actorType: "admin",
      note: "Acompte de 20% confirmé manuellement (virement reçu). Le créneau passe d'option à réservation.",
    });

    return res.json({ success: true, acompteAmount, invoiceUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur confirmation acompte" });
  }
});

router.post("/reservations/:id/contract-signed", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const existing = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "Réservation introuvable" });
    const r = existing[0];
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, r);

    await db
      .update(reservations)
      .set({
        workflowStatut: "contrat_signe",
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));

    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "contrat_signe",
      actorType: "admin",
      note: "Contrat marqué comme signé manuellement depuis le backoffice.",
    });
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState(db, linkedDisponibiliteId);
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur validation contrat" });
  }
});

router.post("/reservations/:id/solde-received", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const existing = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "Réservation introuvable" });
    const r = existing[0];

    const soldeAmount = r.soldeMontant || Math.max(0, r.montantTotal - (r.acompteMontant || 0));
    const acompteAmount = r.acompteMontant || Math.round((r.montantTotal * 20) / 100);

    // Toggle: si déjà confirmé, un second clic annule la confirmation du solde.
    if (r.workflowStatut === "solde_confirme") {
      const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, r);
      await db
        .update(reservations)
        .set({
          workflowStatut: "acompte_confirme",
          montantPaye: acompteAmount,
          statutPaiement: "en_attente",
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, reservationId));
      if (linkedDisponibiliteId) {
        await db
          .update(disponibilites)
          .set({
            statut: "reserve",
            updatedAt: new Date(),
          })
          .where(eq(disponibilites.id, linkedDisponibiliteId));
      }

      await db.insert(reservationStatusHistory).values({
        reservationId,
        fromStatut: "solde_confirme",
        toStatut: "acompte_confirme",
        actorType: "admin",
        note: "Annulation de la confirmation du solde (second clic).",
      });
      if (linkedDisponibiliteId) {
        await refreshDisponibiliteBookingState(db, linkedDisponibiliteId);
      }

      return res.json({ success: true, cancelled: true, soldeAmount: 0, invoiceUrl: null });
    }

    await db
      .update(reservations)
      .set({
        workflowStatut: "solde_confirme",
        montantPaye: r.montantTotal,
        statutPaiement: "paye",
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservationId));
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, r);
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState(db, linkedDisponibiliteId);
    }

    const existingSoldeInvoice = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.reservationId, reservationId), eq(invoices.invoiceType, "solde")))
      .limit(1);

    let invoiceUrl: string | null = null;
    if (existingSoldeInvoice.length) {
      invoiceUrl = existingSoldeInvoice[0].pdfStorageKey
        ? await storageGetSignedUrl(existingSoldeInvoice[0].pdfStorageKey).catch(() => null)
        : null;
    } else {
      const invoiceNumber = buildInvoiceNumber(reservationId, "solde");
      const invoicePdf = await buildInvoicePdf(
        r,
        invoiceNumber,
        "solde",
        soldeAmount,
        r.soldeEcheanceAt || new Date()
      );
      const invoiceFile = await storagePut(
        `commercial/invoices/invoice-solde-${reservationId}.pdf`,
        invoicePdf,
        "application/pdf"
      );

      await db.insert(invoices).values({
        reservationId,
        invoiceNumber,
        invoiceType: "solde",
        amount: soldeAmount,
        currency: "EUR",
        dueAt: r.soldeEcheanceAt || new Date(),
        paidAt: new Date(),
        pdfStorageKey: invoiceFile.key,
      });
      invoiceUrl = invoiceFile.url;
    }

    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "solde_confirme",
      actorType: "admin",
      note: "Solde confirmé manuellement (virement reçu).",
    });

    return res.json({ success: true, soldeAmount, invoiceUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur confirmation solde" });
  }
});

router.get("/reservations/:id/documents", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const [quoteList, contractList, invoiceList] = await Promise.all([
      db.select().from(quotes).where(eq(quotes.reservationId, reservationId)),
      db.select().from(contracts).where(eq(contracts.reservationId, reservationId)),
      db.select().from(invoices).where(eq(invoices.reservationId, reservationId)),
    ]);

    const quotesWithUrls = await Promise.all(
      quoteList.map(async (q) => ({
        ...q,
        downloadUrl: q.pdfStorageKey ? await storageGetSignedUrl(q.pdfStorageKey).catch(() => null) : null,
      }))
    );
    const contractsWithUrls = await Promise.all(
      contractList.map(async (c) => ({
        ...c,
        downloadUrl: c.pdfStorageKey ? await storageGetSignedUrl(c.pdfStorageKey).catch(() => null) : null,
      }))
    );
    const invoicesWithUrls = await Promise.all(
      invoiceList.map(async (i) => ({
        ...i,
        downloadUrl: i.pdfStorageKey ? await storageGetSignedUrl(i.pdfStorageKey).catch(() => null) : null,
      }))
    );

    return res.json({
      quotes: quotesWithUrls,
      contracts: contractsWithUrls,
      invoices: invoicesWithUrls,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur listing documents" });
  }
});

// Webhook générique e-sign (Yousign/DocuSign/other)
router.post("/esign/webhook", async (req, res) => {
  try {
    const expectedSecret = process.env.ESIGN_WEBHOOK_SECRET || ENV.cookieSecret;
    const incomingSecret = req.headers["x-webhook-secret"];
    if (!expectedSecret || incomingSecret !== expectedSecret) {
      return res.status(401).json({ error: "Webhook non autorisé" });
    }
    const { contractId, envelopeId, provider, eventType, payload } = req.body || {};
    if (!eventType || (!contractId && !envelopeId)) {
      return res.status(400).json({ error: "eventType + (contractId ou envelopeId) requis" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    let resolvedContractId: number | null = contractId ? parseInt(contractId, 10) : null;
    if (!resolvedContractId && envelopeId) {
      const matched = await db.select().from(contracts).where(eq(contracts.esignEnvelopeId, String(envelopeId)));
      resolvedContractId = matched[0]?.id ?? null;
    }
    if (!resolvedContractId) {
      return res.status(404).json({ error: "Contrat e-sign introuvable" });
    }

    await db.insert(esignEvents).values({
      contractId: resolvedContractId,
      provider: provider || "other",
      eventType: String(eventType),
      payload: payload ? JSON.stringify(payload) : null,
    });

    const event = String(eventType).toLowerCase();
    const isSigned =
      event.includes("signed") ||
      event.includes("completed") ||
      event.includes("done") ||
      event.includes("signature_request.done");
    if (isSigned) {
      await db
        .update(contracts)
        .set({ signedAt: new Date() })
        .where(eq(contracts.id, resolvedContractId));

      const linked = await db.select().from(contracts).where(eq(contracts.id, resolvedContractId));
      const reservationId = linked[0]?.reservationId;
      if (reservationId) {
        const current = await db.select().from(reservations).where(eq(reservations.id, reservationId));
        const previous = current[0];
        await db
          .update(reservations)
          .set({ workflowStatut: "contrat_signe", updatedAt: new Date() })
          .where(eq(reservations.id, reservationId));
        const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, previous);
        if (linkedDisponibiliteId) {
          await refreshDisponibiliteBookingState(db, linkedDisponibiliteId);
        }
        await db.insert(reservationStatusHistory).values({
          reservationId,
          fromStatut: previous?.workflowStatut || null,
          toStatut: "contrat_signe",
          actorType: "system",
          note: "Contrat signé via webhook e-sign.",
        });
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur webhook e-sign" });
  }
});

export default router;
