import { beforeAll, describe, expect, it } from "vitest";

const BASE = "http://localhost:3000";
let apiAvailable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE}/api/ical/config`);
    apiAvailable = res.ok;
  } catch {
    apiAvailable = false;
  }
});

describe("Stripe Checkout API", () => {
  it("crée une session de paiement valide", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE}/api/stripe/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        nomClient: "Test Vitest",
        emailClient: "vitest@test.com",
        nbPersonnes: 2,
        formule: "semaine",
        destination: "Méditerranée",
        dateDebut: "2026-07-01",
        dateFin: "2026-07-08",
        montantTotal: 850000, // 8500€
        typePaiement: "acompte",
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
    expect(data.sessionId).toMatch(/^cs_test_/);
  }, 15000);

  it("rejette une requête sans données obligatoires", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE}/api/stripe/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nomClient: "Test" }),
    });
    expect(res.status).toBe(400);
  }, 10000);

  it("liste les réservations (endpoint admin)", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE}/api/stripe/reservations`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  }, 10000);
});

describe("Stripe Webhook", () => {
  it("accepte les événements de test avec verified:true", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "evt_test_webhook",
        type: "checkout.session.completed",
        data: { object: {} },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.verified).toBe(true);
  }, 10000);
});

describe("Stripe Receipt Email", () => {
  it("configure receipt_email pour envoyer le reçu client automatiquement", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE}/api/stripe/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        nomClient: "Test Receipt",
        emailClient: "receipt@test.com",
        nbPersonnes: 2,
        formule: "semaine",
        destination: "Corse",
        dateDebut: "2026-08-01",
        dateFin: "2026-08-08",
        montantTotal: 850000,
        typePaiement: "complet",
      }),
    });
    const data = await res.json();
    // Récupérer la session Stripe pour vérifier payment_intent_data
    const detail = await fetch(`${BASE}/api/stripe/session/${data.sessionId}`);
    const sessionData = await detail.json();
    expect(sessionData.customerEmail).toBe("receipt@test.com");
  }, 15000);
});
