import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "../db";
import { reservations } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-11-20.acacia" as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

// Cette route DOIT utiliser express.raw (configuré dans _core/index.ts)
router.post("/", async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;

  try {
    if (!webhookSecret || !signature) {
      // Mode dev : parser le Buffer en JSON
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
      event = typeof req.body === "object" && !Buffer.isBuffer(req.body)
        ? (req.body as Stripe.Event)
        : (JSON.parse(rawBody) as Stripe.Event);
    } else {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    }
  } catch (err: any) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Gestion des events de test
  if (event.id.startsWith("evt_test_")) {
    console.log("[Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const reservationId = session.client_reference_id;

        if (reservationId) {
          const db = await getDb();
          let resv: any = null;
          if (db) {
            await db
              .update(reservations)
              .set({
                statutPaiement: "paye",
                stripePaymentIntentId: session.payment_intent as string,
              })
              .where(eq(reservations.id, parseInt(reservationId)));
            const [r] = await db.select().from(reservations).where(eq(reservations.id, parseInt(reservationId)));
            resv = r;
          }
          console.log(`[Webhook] Paiement confirmé pour réservation #${reservationId}`);

          // Notifier le propriétaire (Léa & Victor)
          if (resv) {
            const dateDebut = new Date(resv.dateDebut).toLocaleDateString("fr-FR");
            const dateFin = new Date(resv.dateFin).toLocaleDateString("fr-FR");
            const montant = (resv.montantPaye / 100).toLocaleString("fr-FR");
            const total = (resv.montantTotal / 100).toLocaleString("fr-FR");
            try {
              await notifyOwner({
                title: `⚓ Nouvelle réservation confirmée : ${resv.nomClient}`,
                content: `**Client :** ${resv.nomClient} (${resv.emailClient}${resv.telClient ? ' / ' + resv.telClient : ''})\n**Croisière :** ${resv.formule} — ${resv.destination}\n**Dates :** ${dateDebut} → ${dateFin}\n**Personnes :** ${resv.nbPersonnes}\n**Payé :** ${montant} €${resv.typePaiement === 'acompte' ? ` (acompte sur ${total} €)` : ''}\n${resv.message ? '\n**Message :** ' + resv.message : ''}`,
              });
            } catch (e) {
              console.error("[Webhook] Erreur notifyOwner:", e);
            }
          }
        }
        break;
      }
      case "checkout.session.expired":
      case "payment_intent.payment_failed": {
        const obj = event.data.object as any;
        const reservationId = obj.client_reference_id || obj.metadata?.reservation_id;
        if (reservationId) {
          const db = await getDb();
          if (db) {
            await db
              .update(reservations)
              .set({ statutPaiement: "echec" })
              .where(eq(reservations.id, parseInt(reservationId)));
          }
        }
        break;
      }
      default:
        console.log(`[Webhook] Event non géré : ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("[Webhook] Erreur lors du traitement:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
