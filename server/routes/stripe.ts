import { Router } from "express";
import Stripe from "stripe";
import { getDb } from "../db";
import { reservations } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-11-20.acacia" as any,
});

// Créer une session de paiement Stripe Checkout
router.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      nomClient,
      emailClient,
      telClient,
      nbPersonnes,
      formule,
      destination,
      dateDebut,
      dateFin,
      montantTotal, // en centimes
      typePaiement, // "acompte" ou "complet"
      typeReservation, // "bateau_entier" | "cabine" | "place"
      nbCabines, // nombre de cabines ou places réservées
      message,
      disponibiliteId,
    } = req.body;

    if (!nomClient || !emailClient || !montantTotal || !formule || !destination) {
      return res.status(400).json({ error: "Données manquantes" });
    }

    // Calculer le montant à payer
    const montantPaye = typePaiement === "acompte"
      ? Math.round(montantTotal * 0.3)
      : montantTotal;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }

    // Créer la réservation en base (en attente de paiement)
    const inserted = await db.insert(reservations).values({
      nomClient,
      emailClient,
      telClient: telClient || null,
      nbPersonnes: parseInt(nbPersonnes) || 1,
      formule,
      destination,
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
      montantTotal,
      typePaiement,
      montantPaye,
      typeReservation: typeReservation || "bateau_entier",
      nbCabines: parseInt(nbCabines) || 1,
      message: message || null,
      disponibiliteId: disponibiliteId || null,
      statutPaiement: "en_attente",
    }).returning({ id: reservations.id });

    const reservationId = inserted[0]?.id;

    // Titre et description de la croisière
    const formuleLabels: Record<string, string> = {
      journee: "Journée catamaran",
      weekend: "Week-end catamaran",
      semaine: "Semaine catamaran",
      traversee: "Traversée Atlantique",
    };

    const typeResLabels: Record<string, string> = {
      bateau_entier: "Bateau entier",
      cabine: `${nbCabines} cabine(s) double(s)`,
      place: `${nbCabines} place(s)`,
    };
    const typeResLabel = typeResLabels[typeReservation] || "Bateau entier";

    const productName = `${formuleLabels[formule] || formule} — ${destination}`;
    const paiementLabel = typePaiement === "acompte"
      ? "Acompte 30%"
      : "Paiement complet";

    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Créer la session Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: productName,
              description: `Sabine Sailing · Lagoon 570 · ${typeResLabel} · ${nbPersonnes} personne(s) · ${paiementLabel}`,
            },
            unit_amount: montantPaye,
          },
          quantity: 1,
        },
      ],
      customer_email: emailClient,
      client_reference_id: reservationId?.toString(),
      payment_intent_data: {
        receipt_email: emailClient,
        description: `${productName} — ${paiementLabel}`,
      },
      metadata: {
        reservation_id: reservationId?.toString() || "",
        nom_client: nomClient,
        email_client: emailClient,
        formule,
        destination,
        type_paiement: typePaiement,
        type_reservation: typeReservation || "bateau_entier",
        nb_cabines: (nbCabines || 1).toString(),
        montant_total: montantTotal.toString(),
      },
      allow_promotion_codes: true,
      success_url: `${origin}/reservation/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/reservation/annule`,
    });

    // Sauvegarder l'ID de session Stripe
    if (reservationId) {
      await db
        .update(reservations)
        .set({ stripeSessionId: session.id })
        .where(eq(reservations.id, reservationId));
    }

    res.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error("[Stripe] Erreur lors de la création de la session:", error);
    res.status(500).json({ error: error.message || "Erreur lors de la création du paiement" });
  }
});

// Récupérer les détails d'une session après paiement réussi
router.get("/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({
      customerEmail: session.customer_email,
      amountTotal: session.amount_total,
      status: session.payment_status,
      metadata: session.metadata,
    });
  } catch (error: any) {
    console.error("[Stripe] Erreur lors de la récupération de la session:", error);
    res.status(500).json({ error: error.message });
  }
});

// Lister toutes les réservations (admin)
router.get("/reservations", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de données non disponible" });
    }
    const all = await db.select().from(reservations).orderBy(reservations.createdAt);
    res.json(all);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
