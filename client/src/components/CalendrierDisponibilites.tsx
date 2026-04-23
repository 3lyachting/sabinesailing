/*
 * DESIGN: Expressionnisme Tropical
 * Calendrier de disponibilités et tarifs — Sabine Sailing
 * Couleurs: Teal (disponible) + Coral (réservé) + Sand (fond)
 * Données: Chargées depuis l'API en temps réel
 */

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Statut = "disponible" | "reserve" | "option" | "ferme";

interface Disponibilite {
  id: number;
  debut: string; // ISO timestamp
  fin: string;
  statut: Statut;
  planningType?: "charter" | "technical_stop" | "maintenance" | "blocked";
  tarif: number | null;
  tarifCabine?: number | null;
  tarifJourPersonne?: number | null;
  tarifJourPriva?: number | null;
  note: string | null;
  notePublique?: string | null;
  destination: string;
  capaciteTotale?: number;
  cabinesReservees?: number;
  createdAt: string;
  updatedAt: string;
}

interface IcalEvent {
  uid: string;
  titre: string;
  description: string;
  debut: string;
  fin: string;
  destination: string;
  statut: Statut;
  tarif: number | null;
  source: string;
}

interface Semaine {
  id?: number;
  debut: string; // "YYYY-MM-DD"
  fin: string;
  statut: Statut;
  tarif?: number;
  tarifCabine?: number;
  tarifJourPersonne?: number;
  tarifJourPriva?: number;
  note?: string;
  destination?: string;
  capaciteTotale?: number;
  cabinesReservees?: number;
  produit?: "croisiere_mediterranee" | "transatlantique" | "croisiere_caraibes";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MOIS_NOMS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MOIS_COMPLETS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function parseDate(s: string) {
  // Créer une date UTC stricte à partir de "YYYY-MM-DD"
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function formatDate(d: Date) {
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${day}/${month}`;
}

function convertDisponibiliteToSemaine(d: Disponibilite): Semaine {
  const debut = new Date(d.debut);
  const fin = new Date(d.fin);
  // Utiliser UTC pour extraire la date
  const debutDate = debut.toISOString().split("T")[0];
  const finDate = fin.toISOString().split("T")[0];
  const m = debut.getUTCMonth() + 1;
  const isMed = m >= 6 && m <= 9;
  const isCaraibes = d.destination.toLowerCase().includes("grenadine") || d.destination.toLowerCase().includes("cara");
  const isTransat = d.destination.toLowerCase().includes("travers") || d.destination.toLowerCase().includes("transat");
  return {
    debut: debutDate,
    fin: finDate,
    statut:
      d.planningType === "technical_stop" || d.planningType === "maintenance" || d.planningType === "blocked"
        ? "ferme"
        : d.statut,
    tarif: d.tarif || undefined,
    tarifCabine: d.tarifCabine || undefined,
    tarifJourPersonne: d.tarifJourPersonne || undefined,
    tarifJourPriva: d.tarifJourPriva || undefined,
    note:
      d.planningType === "technical_stop"
        ? "Arrêt technique"
        : d.planningType === "maintenance"
          ? "Maintenance"
          : d.notePublique || undefined,
    destination: d.destination,
    capaciteTotale: d.capaciteTotale,
    cabinesReservees: d.cabinesReservees,
    produit: isTransat
        ? "transatlantique"
        : isCaraibes
          ? "croisiere_caraibes"
          : isMed
            ? "croisiere_mediterranee"
            : undefined,
  };
}

function convertIcalEventToSemaine(ev: IcalEvent): Semaine {
  const debut = new Date(ev.debut);
  const fin = new Date(ev.fin);

  // Sur iCal, beaucoup d'événements "all-day" ont une date de fin exclusive à 00:00.
  // Sans ce correctif, on bloque un jour de trop (ex: le 26 juin).
  if (
    fin.getUTCHours() === 0 &&
    fin.getUTCMinutes() === 0 &&
    fin.getUTCSeconds() === 0 &&
    fin.getUTCMilliseconds() === 0 &&
    fin.getTime() > debut.getTime()
  ) {
    fin.setUTCDate(fin.getUTCDate() - 1);
  }

  const debutDate = debut.toISOString().split("T")[0];
  const finDate = fin.toISOString().split("T")[0];
  return {
    debut: debutDate,
    fin: finDate,
    statut: ev.statut,
    tarif: ev.tarif || undefined,
    // Ne pas exposer le contenu des événements iCal en public.
    note: undefined,
    destination: ev.destination || "Méditerranée",
    produit: (ev.destination || "").toLowerCase().includes("travers") || (ev.destination || "").toLowerCase().includes("transat")
      ? "transatlantique"
      : undefined,
  };
}

function getStatutPriority(statut: Statut): number {
  switch (statut) {
    case "reserve":
      return 4;
    case "option":
      return 3;
    case "ferme":
      return 2;
    case "disponible":
    default:
      return 1;
  }
}

function getSemaineForDate(date: Date, semaines: Semaine[]): Semaine | null {
  const matching = semaines.filter(s => {
    const debut = parseDate(s.debut);
    const fin = parseDate(s.fin);
    return date >= debut && date <= fin;
  });
  if (matching.length === 0) return null;
  matching.sort((a, b) => {
    const byStatut = getStatutPriority(b.statut) - getStatutPriority(a.statut);
    if (byStatut !== 0) return byStatut;
    // Si même statut, prioriser le créneau le plus rempli pour éviter un samedi "vert"
    // quand un autre créneau concurrent est déjà complet.
    const aRemaining = remainingPlaces(a);
    const bRemaining = remainingPlaces(b);
    if (typeof aRemaining === "number" && typeof bRemaining === "number") {
      return aRemaining - bRemaining;
    }
    return 0;
  });
  return matching[0];
}

function isTurnoverSaturday(date: Date, semaines: Semaine[]) {
  // Rotation hebdo: débarquement le samedi matin, embarquement le samedi après-midi.
  if (date.getUTCDay() !== 6) return false;
  const iso = date.toISOString().split("T")[0];
  const hasDeparture = semaines.some((s) => s.fin === iso);
  const hasEmbark = semaines.some((s) => s.debut === iso);
  return hasDeparture && hasEmbark;
}

function getWeekForBoundary(iso: string, semaines: Semaine[], boundary: "debut" | "fin") {
  const matches = semaines.filter((s) => s[boundary] === iso);
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const byStatut = getStatutPriority(b.statut) - getStatutPriority(a.statut);
    if (byStatut !== 0) return byStatut;
    const aRemaining = remainingPlaces(a);
    const bRemaining = remainingPlaces(b);
    if (typeof aRemaining === "number" && typeof bRemaining === "number") {
      return aRemaining - bRemaining;
    }
    return 0;
  });
  return matches[0];
}

function getSaturdayToSaturdayWindow(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const day = start.getUTCDay(); // 0 dim, 6 sam
  const distanceToPrevSaturday = (day + 1) % 7;
  start.setUTCDate(start.getUTCDate() - distanceToPrevSaturday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function remainingPlaces(semaine?: Semaine | null) {
  if (!semaine) return null;
  if (typeof semaine.capaciteTotale !== "number") return null;
  // En Med/Caraibes on stocke la capacité en cabines (4), mais l'affichage client est en places (8).
  // En transat, la capacité est déjà gérée en places.
  const isTransat = semaine.produit === "transatlantique";
  const multiplier = isTransat ? 1 : 2;
  const totalPlaces = semaine.capaciteTotale * multiplier;
  const reservedUnits = typeof semaine.cabinesReservees === "number" ? semaine.cabinesReservees : 0;
  const reservedPlaces = reservedUnits * multiplier;
  return Math.max(0, totalPlaces - reservedPlaces);
}

function formatCompactPrice(value?: number) {
  if (!value) return "";
  return `${value.toLocaleString("fr-FR")} €`;
}

function isIsoInRange(iso: string, start: string, end: string) {
  return iso >= start && iso <= end;
}

function isDayInProductWindow(isoDay: string, produit: "tous" | "croisiere_mediterranee" | "transatlantique" | "croisiere_caraibes") {
  if (produit === "tous") return true;
  if (produit === "croisiere_mediterranee") {
    const d = parseDate(isoDay);
    const m = d.getUTCMonth() + 1;
    return m >= 6 && m <= 9;
  }
  if (produit === "transatlantique") {
    return isIsoInRange(isoDay, "2026-11-01", "2026-11-10") || isIsoInRange(isoDay, "2027-04-01", "2027-05-01");
  }
  if (produit === "croisiere_caraibes") {
    return isIsoInRange(isoDay, "2026-12-21", "2027-03-31");
  }
  return false;
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function CalendrierDisponibilites() {
  const [semaines, setSemaines] = useState<Semaine[]>([]);
  const [loading, setLoading] = useState(true);
  const [moisAffiche, setMoisAffiche] = useState(new Date());
  const [semaineSelectionnee, setSemaineSelectionnee] = useState<Semaine | null>(null);
  const [produitFiltre, setProduitFiltre] = useState<"tous" | "croisiere_mediterranee" | "transatlantique" | "croisiere_caraibes">("tous");
  const [reservationMode, setReservationMode] = useState<"priva" | "cabine">("cabine");

  // Charger les disponibilités depuis l'API
  useEffect(() => {
    const fetchDisponibilites = async () => {
      try {
        setLoading(true);
        const cacheBust = `t=${Date.now()}`;
        const [disposRes, icalRes] = await Promise.all([
          fetch(`/api/disponibilites?${cacheBust}`, { cache: "no-store" }),
          fetch(`/api/ical/events?${cacheBust}`, { cache: "no-store" }),
        ]);
        if (!disposRes.ok) throw new Error("Erreur lors du chargement des disponibilités");

        const data: Disponibilite[] = await disposRes.json();
        const icalEvents: IcalEvent[] = icalRes.ok ? await icalRes.json() : [];

        // Fusionner les disponibilités manuelles et les événements iCal synchronisés
        const semainesDisponibilites = data.map(convertDisponibiliteToSemaine);
        const semainesIcal = Array.isArray(icalEvents) ? icalEvents.map(convertIcalEventToSemaine) : [];
        const semainesConverties = [...semainesDisponibilites, ...semainesIcal];
        setSemaines(semainesConverties);
        
      } catch (error) {
        console.error("Erreur lors du chargement des disponibilités:", error);
        setSemaines([]);
      } finally {
        setLoading(false);
      }
    }

    fetchDisponibilites();
  }, []);

  const semainesFiltrees = useMemo(() => {
    return semaines.filter((s) => {
      if (produitFiltre === "tous") return true;
      if (produitFiltre === "croisiere_mediterranee") {
        const d = parseDate(s.debut);
        const month = d.getUTCMonth() + 1;
        return month >= 6 && month <= 9 && !String(s.destination || "").toLowerCase().includes("cara") && !String(s.destination || "").toLowerCase().includes("travers");
      }
      return s.produit === produitFiltre;
    });
  }, [semaines, produitFiltre]);

  useEffect(() => {
    const firstMatch = semainesFiltrees.find((s) => s.statut === "disponible");
    if (!firstMatch) return;
    const debut = parseDate(firstMatch.debut);
    setMoisAffiche(new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), 1)));
    setSemaineSelectionnee(firstMatch);
  }, [produitFiltre, semainesFiltrees]);

  const handlePrevMonth = () => {
    const prev = new Date(moisAffiche);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    setMoisAffiche(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(moisAffiche);
    next.setUTCMonth(next.getUTCMonth() + 1);
    setMoisAffiche(next);
  };

  const handleDateClick = (date: Date) => {
    const semaine = getSemaineForDate(date, semainesFiltrees);
    if (semaine) {
      setSemaineSelectionnee(semaine);
      return;
    }
    const { start, end } = getSaturdayToSaturdayWindow(date);
    setSemaineSelectionnee({
      debut: start.toISOString().split("T")[0],
      fin: end.toISOString().split("T")[0],
      statut: "disponible",
      destination: "Méditerranée",
      note: "Créneau semaine (samedi -> samedi) libre",
      produit: produitFiltre === "tous" ? "croisiere_mediterranee" : produitFiltre,
    });
  };

  // Générer les jours du mois en UTC
  const year = moisAffiche.getUTCFullYear();
  const month = moisAffiche.getUTCMonth();
  
  const firstDay = new Date();
  firstDay.setUTCFullYear(year);
  firstDay.setUTCMonth(month);
  firstDay.setUTCDate(1);
  firstDay.setUTCHours(0, 0, 0, 0);
  
  const lastDay = new Date();
  lastDay.setUTCFullYear(year);
  lastDay.setUTCMonth(month + 1);
  lastDay.setUTCDate(0);
  lastDay.setUTCHours(0, 0, 0, 0);
  
  const daysInMonth = lastDay.getUTCDate();
  // getUTCDay: 0 = dimanche ... 6 = samedi
  // Le calendrier affiché démarre le lundi: 0 = lundi ... 6 = dimanche
  const startingDayOfWeek = (firstDay.getUTCDay() + 6) % 7;

  const days = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date();
    d.setUTCFullYear(year);
    d.setUTCMonth(month);
    d.setUTCDate(i);
    d.setUTCHours(0, 0, 0, 0);
    days.push(d);
  }

  const getCalendarColor = (week: Semaine | null | undefined, fallback: Statut) => {
    const rem = remainingPlaces(week);
    if (fallback === "reserve" || fallback === "ferme") return "bg-red-500/90 text-white border-red-600";
    if (typeof rem === "number") {
      const isTransat = week?.produit === "transatlantique";
      const multiplier = isTransat ? 1 : 2;
      const totalPlaces = (week?.capaciteTotale || 0) * multiplier;
      if (rem <= 0) return "bg-red-500/90 text-white border-red-600";
      if (totalPlaces > 0 && rem < totalPlaces) return "bg-orange-400 text-white border-orange-500";
      return "bg-emerald-500 text-white border-emerald-600";
    }
    if (fallback === "option") return "bg-orange-400 text-white border-orange-500";
    return "bg-emerald-500 text-white border-emerald-600";
  };

  const getStatutLabel = (statut: Statut) => {
    switch (statut) {
      case "disponible":
        return "Disponible";
      case "reserve":
        return "Réservé";
      case "option":
        return "Option";
      case "ferme":
        return "Fermé";
      default:
        return statut;
    }
  };

  return (
    <div className="editorial-panel rounded-3xl border border-white/60 bg-gradient-to-b from-white to-[oklch(0.985_0.006_95)] p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] lg:p-10">
      <div className="mb-10">
        <p className="editorial-kicker mb-4">Filtrer par produit</p>
        <div className="flex flex-wrap gap-2.5">
          {[
            { id: "tous", label: "Tous" },
            { id: "croisiere_mediterranee", label: "Croisières Méditerranée" },
            { id: "transatlantique", label: "Transatlantique" },
            { id: "croisiere_caraibes", label: "Croisières Caraïbes" },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setProduitFiltre(item.id as any)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                produitFiltre === item.id
                  ? "bg-[oklch(0.2_0.06_240)] text-white shadow-[0_10px_25px_-14px_rgba(30,58,138,0.9)]"
                  : "bg-white text-[oklch(0.42_0.03_240)] border border-[oklch(0.9_0.02_220)] hover:border-[oklch(0.2_0.06_240)] hover:text-[oklch(0.2_0.06_240)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600 bg-emerald-500 px-3 py-1 font-semibold text-white shadow-sm">
            Libre
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-orange-500 bg-orange-400 px-3 py-1 font-semibold text-white shadow-sm">
            Option / partiel
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-red-600 bg-red-500 px-3 py-1 font-semibold text-white shadow-sm">
            Réservé / fermé
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-orange-500 bg-orange-400 px-3 py-1 font-semibold text-white shadow-sm">
            Samedi rotation 09/15
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-[oklch(0.2_0.06_240)]"></div>
          <p className="text-[oklch(0.45_0.04_220)] mt-4">Chargement du calendrier...</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-10 lg:gap-12">
            {/* Calendrier */}
            <div className="lg:col-span-2 rounded-2xl border border-[oklch(0.9_0.02_220)] bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] lg:p-8">
              {/* Navigation mois */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={handlePrevMonth}
                  className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-[oklch(0.2_0.06_240)]" />
                </button>
                <h3 className="text-2xl font-bold tracking-[-0.01em] text-[oklch(0.15_0.05_220)]" style={{ fontFamily: "Syne, sans-serif" }}>
                  {MOIS_COMPLETS[moisAffiche.getUTCMonth()]} {moisAffiche.getUTCFullYear()}
                </h3>
                <button
                  onClick={handleNextMonth}
                  className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-[oklch(0.2_0.06_240)]" />
                </button>
              </div>

              {/* Jours de la semaine */}
              <div className="grid grid-cols-7 gap-3 mb-5 rounded-xl bg-[oklch(0.985_0.008_240)] px-3 py-2.5">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => (
                  <div key={day} className="text-center text-sm font-semibold text-[oklch(0.45_0.04_220)]">
                    {day}
                  </div>
                ))}
              </div>

              {/* Jours du mois */}
              <div className="grid grid-cols-7 gap-3">
                {days.map((day, i) => {
                  if (!day) {
                    return <div key={`empty-${i}`} className="aspect-square min-h-[86px]" />;
                  }

                  const iso = day.toISOString().split("T")[0];
                  const semaine = getSemaineForDate(day, semainesFiltrees);
                  const inProductWindow = isDayInProductWindow(iso, produitFiltre);
                  const resolved = semaine || {
                    debut: iso,
                    fin: iso,
                    statut: (inProductWindow ? "disponible" : "ferme") as Statut,
                    destination: inProductWindow ? "Disponible" : "Hors produit",
                  };
                  const visibleInFilter = Boolean(semaine) || inProductWindow;
                  const turnoverSaturday = isTurnoverSaturday(day, semainesFiltrees);
                  const displayStatut: Statut = turnoverSaturday ? "option" : resolved.statut;
                  const endingWeek = turnoverSaturday ? getWeekForBoundary(iso, semainesFiltrees, "fin") : null;
                  const startingWeek = turnoverSaturday ? getWeekForBoundary(iso, semainesFiltrees, "debut") : null;
                  const endingColor = getCalendarColor(endingWeek, endingWeek?.statut || "option");
                  const startingColor = getCalendarColor(startingWeek, startingWeek?.statut || "option");
                  const isSelected = semaineSelectionnee && 
                    parseDate(semaineSelectionnee.debut) <= day && 
                    day <= parseDate(semaineSelectionnee.fin) &&
                    (produitFiltre === "tous" || semaineSelectionnee.produit === produitFiltre);

                  const placesLeft = remainingPlaces(semaine);
                  const cardPrice =
                    reservationMode === "priva"
                      ? semaine?.tarifJourPriva ?? semaine?.tarif
                      : semaine?.tarifCabine ?? semaine?.tarifJourPersonne ?? semaine?.tarif;
                  const isBookableWeek = resolved.statut === "disponible" || resolved.statut === "option";
                  const priceLabel = isBookableWeek ? formatCompactPrice(cardPrice) : "";
                  const priceSuffix = reservationMode === "cabine" ? " cabine" : "";
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => handleDateClick(day)}
                      disabled={!visibleInFilter}
                      className={`aspect-square min-h-[86px] rounded-xl text-sm font-semibold transition-all duration-200 flex flex-col items-center justify-center leading-tight relative overflow-hidden ${
                        `${turnoverSaturday ? "bg-transparent text-white" : getCalendarColor(semaine, displayStatut)} ${
                          visibleInFilter ? "cursor-pointer hover:scale-[1.02] hover:shadow-lg" : "opacity-25 cursor-not-allowed"
                        } border ${
                          isSelected ? "ring-2 ring-[oklch(0.2_0.06_240)] ring-offset-2" : ""
                        }`
                      }`}
                    >
                      {turnoverSaturday && (
                        <>
                          <span className={`absolute inset-y-0 left-0 w-1/2 ${endingColor}`} />
                          <span className={`absolute inset-y-0 right-0 w-1/2 ${startingColor}`} />
                          <span className="absolute inset-y-0 left-1/2 w-px bg-white/70" />
                        </>
                      )}
                      <span className="font-bold">{day.getUTCDate()}</span>
                      {turnoverSaturday && <span className="text-[9px] opacity-80">09/15</span>}
                      {priceLabel && <span className="text-[10px] opacity-90">{`${priceLabel}${priceSuffix}`}</span>}
                      {typeof placesLeft === "number" && (
                        <span className="text-[10px] opacity-80">{placesLeft} pl.</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Détails de la semaine sélectionnée */}
            <div className="rounded-2xl border border-[oklch(0.9_0.02_220)] bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] lg:p-7 h-fit">
              <h3 className="text-xl font-bold text-[oklch(0.15_0.05_220)] mb-5 tracking-[-0.01em]" style={{ fontFamily: "Syne, sans-serif" }}>
                Détails
              </h3>

              {semaineSelectionnee ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-[oklch(0.45_0.04_220)] uppercase font-semibold mb-1">Période</p>
                    <p className="text-sm font-medium text-[oklch(0.15_0.05_220)]">
                      {formatDate(parseDate(semaineSelectionnee.debut))} → {formatDate(parseDate(semaineSelectionnee.fin))}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[oklch(0.45_0.04_220)] uppercase font-semibold mb-1">Destination</p>
                    <p className="text-sm font-medium text-[oklch(0.15_0.05_220)]">
                      {semaineSelectionnee.destination}
                    </p>
                  </div>

                  {typeof remainingPlaces(semaineSelectionnee) === "number" && (
                    <div>
                      <p className="text-xs text-[oklch(0.45_0.04_220)] uppercase font-semibold mb-1">Places disponibles</p>
                      <p className="text-sm font-medium text-[oklch(0.15_0.05_220)]">
                        {(() => {
                          const isTransat = semaineSelectionnee.produit === "transatlantique";
                          const multiplier = isTransat ? 1 : 2;
                          const totalPlaces = (semaineSelectionnee.capaciteTotale || 0) * multiplier;
                          return `${remainingPlaces(semaineSelectionnee)} / ${totalPlaces || "?"}`;
                        })()}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-[oklch(0.45_0.04_220)] uppercase font-semibold mb-1">Statut</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getCalendarColor(semaineSelectionnee, semaineSelectionnee.statut)}`}>
                      {getStatutLabel(semaineSelectionnee.statut)}
                    </span>
                  </div>

                  {(semaineSelectionnee.statut === "disponible" || semaineSelectionnee.statut === "option") && (
                    <div>
                      <p className="text-xs text-[oklch(0.45_0.04_220)] uppercase font-semibold mb-2">Type de réservation</p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <button
                          onClick={() => setReservationMode("priva")}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                            reservationMode === "priva"
                              ? "bg-[oklch(0.2_0.06_240)] text-white border-[oklch(0.2_0.06_240)]"
                              : "bg-white text-[oklch(0.2_0.06_240)] border-[oklch(0.85_0.02_220)]"
                          }`}
                        >
                          Privatif
                        </button>
                        <button
                          onClick={() => setReservationMode("cabine")}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                            reservationMode === "cabine"
                              ? "bg-[oklch(0.2_0.06_240)] text-white border-[oklch(0.2_0.06_240)]"
                              : "bg-white text-[oklch(0.2_0.06_240)] border-[oklch(0.85_0.02_220)]"
                          }`}
                        >
                          Cabine
                        </button>
                      </div>
                      <p className="text-xs text-[oklch(0.45_0.04_220)] uppercase font-semibold mb-1">Tarif</p>
                      <p className="text-2xl font-bold text-[oklch(0.2_0.06_240)]">
                        {(
                          reservationMode === "priva"
                            ? semaineSelectionnee.tarifJourPriva ?? semaineSelectionnee.tarif ?? 0
                            : semaineSelectionnee.tarifCabine ?? semaineSelectionnee.tarifJourPersonne ?? semaineSelectionnee.tarif ?? 0
                        ).toLocaleString("fr-FR")} €
                      </p>
                      <p className="text-xs text-[oklch(0.45_0.04_220)]">
                        {reservationMode === "priva" ? "bateau privatisé" : "par cabine / personne"}
                      </p>
                    </div>
                  )}

                  {semaineSelectionnee.note && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-900 font-medium">{semaineSelectionnee.note}</p>
                    </div>
                  )}

                  {(semaineSelectionnee.statut === "disponible" || semaineSelectionnee.statut === "option") && (
                    <a
                      href={`/reservation?id=${semaineSelectionnee.id}&destination=${encodeURIComponent(semaineSelectionnee.destination || "")}&formule=semaine&typeReservation=${reservationMode === "priva" ? "bateau_entier" : "cabine"}&montant=${
                        reservationMode === "priva"
                          ? semaineSelectionnee.tarifJourPriva ?? semaineSelectionnee.tarif ?? 0
                          : semaineSelectionnee.tarifCabine ?? semaineSelectionnee.tarifJourPersonne ?? semaineSelectionnee.tarif ?? 0
                      }&dateDebut=${encodeURIComponent(semaineSelectionnee.debut || "")}&dateFin=${encodeURIComponent(semaineSelectionnee.fin || "")}`}
                      className="w-full mt-6 px-4 py-3.5 bg-[oklch(0.2_0.06_240)] text-white rounded-xl font-bold hover:bg-[oklch(0.16_0.05_240)] transition-colors text-center block shadow-lg"
                    >
                      Réserver →
                    </a>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Info className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-[oklch(0.45_0.04_220)]">
                    Cliquez sur une date pour voir les détails
                  </p>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  );
}
