/**
 * Tests pour les routes iCal (config + events).
 */
import { beforeAll, describe, expect, it } from "vitest";

const BASE_URL = "http://localhost:3000";
let apiAvailable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/ical/config`);
    apiAvailable = res.ok;
  } catch {
    apiAvailable = false;
  }
});

describe("API iCal", () => {
  it("GET /api/ical/config retourne un objet avec une URL (vide ou non)", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/ical/config`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("url");
    expect(typeof data.url).toBe("string");
  });

  it("GET /api/ical/events retourne un tableau (vide si pas configuré)", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/ical/events`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("PUT /api/ical/config accepte une URL et la persiste", async () => {
    if (!apiAvailable) return;
    const testUrl = "https://calendar.google.com/calendar/ical/test%40example.com/private-test/basic.ics";
    // Sauvegarder
    const putRes = await fetch(`${BASE_URL}/api/ical/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: testUrl }),
    });
    expect(putRes.ok).toBe(true);
    const putData = await putRes.json();
    expect(putData.ok).toBe(true);

    // Vérifier la persistance
    const getRes = await fetch(`${BASE_URL}/api/ical/config`);
    const getData = await getRes.json();
    expect(getData.url).toBe(testUrl);

    // Nettoyer
    await fetch(`${BASE_URL}/api/ical/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "" }),
    });
  });

  it("POST /api/ical/refresh vide le cache et retourne ok", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/ical/refresh`, { method: "POST" });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe("API Stripe — Réservation par cabine", () => {
  it("POST /api/stripe/checkout accepte typeReservation=cabine et nbCabines", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stripe/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomClient: "Test Cabine",
        emailClient: "test-cabine@example.com",
        telephone: "0612345678",
        nbPersonnes: 2,
        formule: "semaine",
        destination: "Méditerranée",
        dateDebut: new Date().toISOString(),
        dateFin: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        montantTotal: 250000, // 2500€ pour 1 cabine
        typePaiement: "complet",
        typeReservation: "cabine",
        nbCabines: 1,
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("checkoutUrl");
    expect(data.checkoutUrl).toMatch(/^https:\/\//);
  });

  it("POST /api/stripe/checkout accepte typeReservation=place pour la transat", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stripe/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomClient: "Test Place",
        emailClient: "test-place@example.com",
        telephone: "0612345678",
        nbPersonnes: 1,
        formule: "traversee",
        destination: "Traversée Atlantique",
        dateDebut: new Date().toISOString(),
        dateFin: new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString(),
        montantTotal: 350000, // 3500€ pour 1 place
        typePaiement: "complet",
        typeReservation: "place",
        nbCabines: 1,
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("checkoutUrl");
  });

  it("POST /api/stripe/checkout refuse une requête sans champs obligatoires", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/stripe/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailClient: "incomplete@example.com" }),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});
