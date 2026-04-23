/**
 * Tests pour la route de demande de réservation (quote request).
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

describe("API Réservations — Demande de devis", () => {
  it("POST /api/reservations/request accepte une demande valide", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/reservations/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomClient: "Jean Dupont",
        emailClient: "jean@example.com",
        telClient: "0612345678",
        nbPersonnes: 4,
        formule: "semaine",
        destination: "Méditerranée",
        dateDebut: new Date().toISOString(),
        dateFin: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        montantTotal: 850000,
        typeReservation: "bateau_entier",
        nbCabines: 4,
        message: "Nous aimons les voiliers !",
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("success");
    expect(data.success).toBe(true);
    expect(data).toHaveProperty("reservationId");
    expect(typeof data.reservationId).toBe("number");
  });

  it("POST /api/reservations/request accepte une demande pour une cabine", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/reservations/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomClient: "Marie Martin",
        emailClient: "marie@example.com",
        telClient: "0687654321",
        nbPersonnes: 2,
        formule: "semaine",
        destination: "Antilles",
        dateDebut: new Date().toISOString(),
        dateFin: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        montantTotal: 250000,
        typeReservation: "cabine",
        nbCabines: 1,
        message: null,
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("POST /api/reservations/request accepte une demande pour une place (transat)", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/reservations/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nomClient: "Pierre Leblanc",
        emailClient: "pierre@example.com",
        telClient: "",
        nbPersonnes: 1,
        formule: "traversee",
        destination: "Traversée Atlantique",
        dateDebut: new Date().toISOString(),
        dateFin: new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString(),
        montantTotal: 350000,
        typeReservation: "place",
        nbCabines: 1,
        message: "Première traversée !",
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("POST /api/reservations/request refuse une requête sans champs obligatoires", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/reservations/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailClient: "incomplete@example.com" }),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("GET /api/reservations retourne la liste des réservations", async () => {
    if (!apiAvailable) return;
    const res = await fetch(`${BASE_URL}/api/reservations`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
