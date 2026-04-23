/*
 * DESIGN: Charte Sabine Sailing
 * Page d'administration — Gestion du calendrier
 * Couleurs: Bleu marine + Teal + Blanc
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Edit2, Trash2, Calendar, LogOut, Anchor, CreditCard, Check, Clock, X, Link2, FileText, Users, Wrench, ChevronLeft, ChevronRight } from "lucide-react";
import ConfigIcal from "@/components/ConfigIcal";
import BackofficeOps from "@/components/BackofficeOps";
import logoSabine from "/logo-sabine.png";

interface Reservation {
  id: number;
  nomClient: string;
  emailClient: string;
  telClient: string | null;
  nbPersonnes: number;
  disponibiliteId?: number | null;
  formule: string;
  destination: string;
  dateDebut: string;
  dateFin: string;
  montantTotal: number;
  montantPaye: number;
  typeReservation?: "bateau_entier" | "cabine" | "place";
  nbCabines?: number;
  typePaiement: "acompte" | "complet";
  statutPaiement: "en_attente" | "paye" | "echec" | "rembourse";
  workflowStatut?:
    | "demande"
    | "refusee"
    | "validee_owner"
    | "devis_emis"
    | "devis_accepte"
    | "contrat_envoye"
    | "contrat_signe"
    | "acompte_attente"
    | "acompte_confirme"
    | "facture_emise"
    | "solde_attendu"
    | "solde_confirme";
  acompteMontant?: number;
  soldeMontant?: number;
  soldeEcheanceAt?: string | null;
  message: string | null;
  createdAt: string;
}

interface Disponibilite {
  id: number;
  planningType?: "charter" | "technical_stop" | "maintenance" | "blocked";
  debut: string;
  fin: string;
  statut: "disponible" | "reserve" | "option" | "ferme";
  tarif: number | null;
  tarifCabine?: number | null;
  tarifJourPersonne?: number | null;
  tarifJourPriva?: number | null;
  destination: string;
  note: string | null;
  notePublique: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CabinesReservees {
  id: number;
  disponibiliteId: number;
  nbReservees: number;
  nbTotal: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function Admin() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authOk, setAuthOk] = useState(false);
  const [tab, setTab] = useState<"disponibilites" | "reservations" | "config" | "documents" | "equipage" | "maintenance" | string>("disponibilites");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [disponibilites, setDisponibilites] = useState<Disponibilite[]>([]);
  const [cabinesMap, setCabinesMap] = useState<Record<number, CabinesReservees>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCabinesId, setEditingCabinesId] = useState<number | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchDispo, setSearchDispo] = useState("");
  const [filterStatut, setFilterStatut] = useState<"tous" | "disponible" | "reserve" | "option" | "ferme">("tous");
  const [filterPlanningType, setFilterPlanningType] = useState<"tous" | "charter" | "technical_stop" | "maintenance" | "blocked">("tous");
  const [calendarViewMode, setCalendarViewMode] = useState<"list" | "calendar">("calendar");
  const [calendarMonth, setCalendarMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDispo, setSelectedCalendarDispo] = useState<Disponibilite | null>(null);
  const [showCabinesForm, setShowCabinesForm] = useState(false);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationActionLoadingId, setReservationActionLoadingId] = useState<number | null>(null);
  const [reservationActionMessage, setReservationActionMessage] = useState("");
  const [reservationDocsMap, setReservationDocsMap] = useState<
    Record<number, { quoteUrl: string | null; contractUrl: string | null }>
  >({});
  const [cabinesFormData, setCabinesFormData] = useState({ nbReservees: 0, nbTotal: 4, notes: "" });
  const [reservationFormData, setReservationFormData] = useState<Partial<Reservation>>({
    nomClient: "",
    emailClient: "",
    telClient: "",
    nbPersonnes: 1,
    formule: "",
    destination: "",
    dateDebut: "",
    dateFin: "",
    montantTotal: 0,
    typeReservation: "cabine",
    nbCabines: 1,
    statutPaiement: "en_attente",
    workflowStatut: "demande",
  });
  const [formData, setFormData] = useState<{
    planningType: "charter" | "technical_stop" | "maintenance" | "blocked";
    debut: string;
    fin: string;
    statut: "disponible" | "reserve" | "option" | "ferme";
    tarif: string;
    tarifCabine: string;
    destination: string;
    note: string;
    notePublique: string;
  }>({
    planningType: "charter",
    debut: "",
    fin: "",
    statut: "disponible",
    tarif: "",
    tarifCabine: "",
    destination: "Méditerranée",
    note: "",
    notePublique: "",
  });
  // Vérifie la session admin locale avant de charger les données métier.
  useEffect(() => {
    const verifyAdminSession = async () => {
      try {
        const response = await fetch("/api/admin-auth/me", {
          credentials: "include",
        });
        if (!response.ok) {
          window.location.href = "/home/admin/login";
          return;
        }
        setAuthOk(true);
      } catch {
        window.location.href = "/home/admin/login";
      } finally {
        setAuthChecked(true);
      }
    };
    void verifyAdminSession();
  }, []);

  // Charger les disponibilités, réservations et cabines
  useEffect(() => {
    if (!authOk) return;
    fetchDisponibilites();
    fetchReservations();
    fetchCabinesReservees();
  }, [authOk]);

  const fetchCabinesReservees = async () => {
    try {
      const res = await fetch("/api/cabines-reservees");
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<number, CabinesReservees> = {};
      data.forEach((c: CabinesReservees) => {
        map[c.disponibiliteId] = c;
      });
      setCabinesMap(map);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReservations = async () => {
    try {
      const res = await fetch("/api/reservations");
      if (!res.ok) return;
      const data = await res.json();
      setReservations(data);
      await Promise.all(
        (Array.isArray(data) ? data : []).map(async (r: Reservation) => {
          await loadReservationDocuments(r.id);
        })
      );
    } catch (e) {
      console.error(e);
    }
  };

  const loadReservationDocuments = async (reservationId: number) => {
    try {
      const response = await fetch(`/api/workflow/reservations/${reservationId}/documents`);
      if (!response.ok) return;
      const payload = await response.json();
      const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
      const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
      const latestQuote = quotes.slice().sort((a: any, b: any) => (b.id || 0) - (a.id || 0))[0];
      const latestContract = contracts.slice().sort((a: any, b: any) => (b.id || 0) - (a.id || 0))[0];
      setReservationDocsMap((prev) => ({
        ...prev,
        [reservationId]: {
          quoteUrl: latestQuote?.downloadUrl || null,
          contractUrl: latestContract?.downloadUrl || null,
        },
      }));
    } catch (error) {
      console.error(error);
    }
  };

  const fetchDisponibilites = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/disponibilites");
      if (!response.ok) throw new Error("Erreur lors du chargement");
      const data = await response.json();
      setDisponibilites(data);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        tarif: formData.tarif ? parseInt(formData.tarif) : null,
        tarifCabine: formData.tarifCabine ? parseInt(formData.tarifCabine) : null,
        tarifJourPersonne: null,
        tarifJourPriva: null,
        debut: new Date(formData.debut).toISOString(),
        fin: new Date(formData.fin).toISOString(),
      };

      if (editingId) {
        // Mise à jour
        const response = await fetch(`/api/disponibilites/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Erreur lors de la mise à jour");
      } else {
        // Création
        const response = await fetch("/api/disponibilites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("Erreur lors de la création");
      }

      // Réinitialiser le formulaire
      setFormData({
        planningType: "charter",
        debut: "",
        fin: "",
        statut: "disponible",
        tarif: "",
        tarifCabine: "",
        destination: "Méditerranée",
        note: "",
        notePublique: "",
      });
      setEditingId(null);
      setShowForm(false);

      // Recharger les données
      fetchDisponibilites();
    } catch (error) {
      console.error("Erreur:", error);
      alert("Une erreur est survenue");
    }
  };

  const handleEdit = (dispo: Disponibilite) => {
    setFormData({
      planningType: dispo.planningType || "charter",
      debut: new Date(dispo.debut).toISOString().slice(0, 16),
      fin: new Date(dispo.fin).toISOString().slice(0, 16),
      statut: dispo.statut,
      tarif: dispo.tarif?.toString() || "",
      tarifCabine: dispo.tarifCabine?.toString() || "",
      destination: dispo.destination,
      note: dispo.note || "",
      notePublique: dispo.notePublique || "",
    });
    setEditingId(dispo.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette disponibilité ?")) return;
    try {
      const response = await fetch(`/api/disponibilites/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Erreur lors de la suppression");
      fetchDisponibilites();
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la suppression");
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      planningType: "charter",
      debut: "",
      fin: "",
      statut: "disponible",
      tarif: "",
      tarifCabine: "",
      destination: "Méditerranée",
      note: "",
      notePublique: "",
    });
  };

  const readErrorMessage = async (response: Response, fallback: string) => {
    try {
      const payload = await response.json();
      return payload?.error || fallback;
    } catch {
      return fallback;
    }
  };

  const performReservationAction = async (reservationId: number, action: () => Promise<Response>, successMessage: string) => {
    if (reservationActionLoadingId !== null) return;
    setReservationActionLoadingId(reservationId);
    setReservationActionMessage("");
    try {
      const response = await action();
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Action impossible"));
      }
      setReservationActionMessage(successMessage);
      await fetchReservations();
    } catch (error: any) {
      setReservationActionMessage(error?.message || "Erreur lors de l'action");
    } finally {
      setReservationActionLoadingId(null);
    }
  };

  const previewLatestQuote = async (reservationId: number) => {
    setReservationActionLoadingId(reservationId);
    setReservationActionMessage("");
    try {
      const response = await fetch(`/api/workflow/reservations/${reservationId}/documents`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Impossible de récupérer les documents"));
      }
      const payload = await response.json();
      const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
      const latest = quotes.slice().sort((a: any, b: any) => (b.id || 0) - (a.id || 0))[0];
      if (!latest?.downloadUrl) {
        throw new Error("Aucun devis disponible. Cliquez d'abord sur 'Générer le devis'.");
      }
      window.open(latest.downloadUrl, "_blank", "noopener,noreferrer");
      setReservationActionMessage("Aperçu du devis ouvert.");
    } catch (error: any) {
      setReservationActionMessage(error?.message || "Erreur lors de l'ouverture du devis");
    } finally {
      setReservationActionLoadingId(null);
    }
  };

  const generateQuoteAndContract = async (reservationId: number) => {
    if (reservationActionLoadingId !== null) return;
    setReservationActionLoadingId(reservationId);
    setReservationActionMessage("");
    try {
      const response = await fetch(`/api/workflow/reservations/${reservationId}/owner-validate`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Génération devis/contrat impossible"));
      }
      const payload = await response.json();
      const quoteUrl = payload?.quoteUrl;
      const contractUrl = payload?.contractUrl;
      if (!quoteUrl || !contractUrl) {
        throw new Error("Le serveur n'a pas renvoyé les deux documents (devis + contrat).");
      }

      window.open(quoteUrl, "_blank", "noopener,noreferrer");
      window.open(contractUrl, "_blank", "noopener,noreferrer");
      setReservationActionMessage("Devis et contrat générés et ouverts.");
      await fetchReservations();
      await loadReservationDocuments(reservationId);
    } catch (error: any) {
      setReservationActionMessage(error?.message || "Erreur lors de la génération devis/contrat");
    } finally {
      setReservationActionLoadingId(null);
    }
  };

  const previewLatestContract = async (reservationId: number) => {
    setReservationActionLoadingId(reservationId);
    setReservationActionMessage("");
    try {
      const response = await fetch(`/api/workflow/reservations/${reservationId}/documents`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Impossible de récupérer les documents"));
      }
      const payload = await response.json();
      const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
      const latest = contracts.slice().sort((a: any, b: any) => (b.id || 0) - (a.id || 0))[0];
      if (!latest?.downloadUrl) {
        throw new Error("Aucun contrat disponible. Cliquez d'abord sur 'Devis + contrat'.");
      }
      window.open(latest.downloadUrl, "_blank", "noopener,noreferrer");
      setReservationActionMessage("Aperçu du contrat ouvert.");
    } catch (error: any) {
      setReservationActionMessage(error?.message || "Erreur lors de l'ouverture du contrat");
    } finally {
      setReservationActionLoadingId(null);
    }
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case "disponible":
        return "bg-teal-100 text-teal-800 border-teal-300";
      case "reserve":
        return "bg-red-100 text-red-800 border-red-300";
      case "option":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "ferme":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatutLabel = (statut: Disponibilite["statut"]) => {
    if (statut === "disponible") return "Libre";
    if (statut === "reserve") return "Réservé / complet";
    if (statut === "option") return "Partiellement rempli";
    return "Fermé";
  };

  const getPlanningTypeLabel = (planningType?: Disponibilite["planningType"]) => {
    if (planningType === "technical_stop") return "Arrêt technique";
    if (planningType === "maintenance") return "Maintenance";
    if (planningType === "blocked") return "Blocage manuel";
    return "Charter";
  };

  const getPlanningTypeColor = (planningType?: Disponibilite["planningType"]) => {
    if (planningType === "technical_stop") return "bg-orange-100 text-orange-800 border-orange-300";
    if (planningType === "maintenance") return "bg-violet-100 text-violet-800 border-violet-300";
    if (planningType === "blocked") return "bg-slate-200 text-slate-800 border-slate-300";
    return "bg-blue-100 text-blue-800 border-blue-300";
  };

  const filteredDisponibilites = useMemo(() => {
    return disponibilites
      .filter((d) => {
        if (filterStatut !== "tous" && d.statut !== filterStatut) return false;
        if (filterPlanningType !== "tous" && (d.planningType || "charter") !== filterPlanningType) return false;
        if (!searchDispo.trim()) return true;
        const q = searchDispo.toLowerCase().trim();
        return (
          d.destination.toLowerCase().includes(q) ||
          (d.notePublique || "").toLowerCase().includes(q) ||
          (d.note || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => +new Date(b.debut) - +new Date(a.debut));
  }, [disponibilites, filterPlanningType, filterStatut, searchDispo]);

  const dispoStats = useMemo(() => {
    const total = disponibilites.length;
    const libres = disponibilites.filter((d) => d.statut === "disponible").length;
    const partiels = disponibilites.filter((d) => d.statut === "option").length;
    const bloques = disponibilites.filter((d) => d.statut === "reserve" || d.statut === "ferme").length;
    return { total, libres, partiels, bloques };
  }, [disponibilites]);

  const toDayStart = (value: string | Date) => {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const statutPriority = (statut: Disponibilite["statut"]) => {
    if (statut === "reserve") return 4;
    if (statut === "option") return 3;
    if (statut === "ferme") return 2;
    return 1;
  };

  const findDispoForDate = (date: Date) => {
    const day = toDayStart(date);
    const matching = filteredDisponibilites.filter((d) => {
      const start = toDayStart(d.debut);
      const end = toDayStart(d.fin);
      return day >= start && day <= end;
    });
    if (!matching.length) return null;
    return matching.sort((a, b) => statutPriority(b.statut) - statutPriority(a.statut))[0];
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const lastDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startOffset = (firstDay.getDay() + 6) % 7; // lundi = 0
    const days: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), i));
    }
    return days;
  }, [calendarMonth]);

  useEffect(() => {
    if (!selectedCalendarDispo) return;
    const stillVisible = filteredDisponibilites.some((d) => d.id === selectedCalendarDispo.id);
    if (!stillVisible) setSelectedCalendarDispo(null);
  }, [filteredDisponibilites, selectedCalendarDispo]);

  const selectedDispoReservations = useMemo(() => {
    if (!selectedCalendarDispo) return [];
    const dispoStart = new Date(selectedCalendarDispo.debut).getTime();
    const dispoEnd = new Date(selectedCalendarDispo.fin).getTime();
    return reservations.filter((r) => {
      if (r.disponibiliteId && r.disponibiliteId === selectedCalendarDispo.id) return true;
      const rStart = new Date(r.dateDebut).getTime();
      const rEnd = new Date(r.dateFin).getTime();
      return rStart < dispoEnd && rEnd > dispoStart;
    });
  }, [reservations, selectedCalendarDispo]);

  const selectedDispoMetrics = useMemo(() => {
    if (!selectedCalendarDispo) {
      return { totalCabines: 0, reservedCabines: 0, availableCabines: 0, totalEncaissedCents: 0 };
    }
    const totalCabines =
      (cabinesMap[selectedCalendarDispo.id]?.nbTotal ?? (selectedCalendarDispo as any).capaciteTotale ?? 4) || 4;

    const effectiveReservations = selectedDispoReservations.filter((r) =>
      ["contrat_signe", "acompte_confirme", "solde_confirme"].includes(r.workflowStatut || "demande")
    );
    const hasPrivate = effectiveReservations.some((r) => r.typeReservation === "bateau_entier");
    const reservedCabines = hasPrivate
      ? totalCabines
      : effectiveReservations
          .filter((r) => r.typeReservation === "cabine" || r.typeReservation === "place")
          .reduce((sum, r) => sum + Math.max(1, r.nbCabines || 1), 0);
    const clampedReserved = Math.max(0, Math.min(totalCabines, reservedCabines));
    const totalEncaissedCents = selectedDispoReservations.reduce((sum, r) => sum + Math.max(0, r.montantPaye || 0), 0);

    return {
      totalCabines,
      reservedCabines: clampedReserved,
      availableCabines: Math.max(0, totalCabines - clampedReserved),
      totalEncaissedCents,
    };
  }, [cabinesMap, selectedCalendarDispo, selectedDispoReservations]);

  if (!authChecked || !authOk) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 text-slate-700">
          Vérification de la session administrateur...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoSabine} alt="Logo Sabine Sailing" className="h-12 w-auto object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-blue-900">Sabine Sailing</h1>
              <p className="text-xs text-slate-500">Admin — Gestion du calendrier</p>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                await fetch("/api/admin-auth/logout", {
                  method: "POST",
                  credentials: "include",
                });
              } finally {
                window.location.href = "/home/admin/login";
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Onglets */}
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          <button
            onClick={() => setTab("disponibilites")}
            className={`px-5 py-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              tab === "disponibilites"
                ? "text-blue-900 border-blue-900"
                : "text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            <Calendar className="w-4 h-4" /> Calendrier
          </button>
          <button
            onClick={() => setTab("reservations")}
            className={`px-5 py-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              tab === "reservations"
                ? "text-blue-900 border-blue-900"
                : "text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            <CreditCard className="w-4 h-4" /> Réservations
                    {reservations.length > 0 && (
                      <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                        {reservations.length}
                      </span>
                    )}
          </button>
          <button
            onClick={() => setTab("config")}
            className={`px-5 py-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              tab === "config"
                ? "text-blue-900 border-blue-900"
                : "text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            <Link2 className="w-4 h-4" /> Synchronisation
          </button>
          <button
            onClick={() => setTab("documents")}
            className={`px-5 py-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              tab === "documents"
                ? "text-blue-900 border-blue-900"
                : "text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            <FileText className="w-4 h-4" /> Documents bateau
          </button>
          <button
            onClick={() => setTab("equipage")}
            className={`px-5 py-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              tab === "equipage"
                ? "text-blue-900 border-blue-900"
                : "text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            <Users className="w-4 h-4" /> Équipage
          </button>
          <button
            onClick={() => setTab("maintenance")}
            className={`px-5 py-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors ${
              tab === "maintenance"
                ? "text-blue-900 border-blue-900"
                : "text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            <Wrench className="w-4 h-4" /> Maintenance
          </button>
        </div>

        {/* Vue Synchronisation iCal */}
        {tab === "config" && <ConfigIcal />}
        {tab === "documents" && <BackofficeOps mode="documents" />}
        {tab === "equipage" && <BackofficeOps mode="crew" />}
        {tab === "maintenance" && <BackofficeOps mode="maintenance" />}

        {/* Vue Réservations */}
        {tab === "reservations" && (
          <div>
            <div className="mb-6">
              <div>
                <h2 className="text-3xl font-bold text-blue-900 flex items-center gap-2">
                  <CreditCard className="w-8 h-8" />
                  Demandes de Réservation
                </h2>
                <p className="text-slate-600 mt-1">Suivi des demandes de devis clients</p>
              </div>
            </div>
            {reservationActionMessage && (
              <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm">
                {reservationActionMessage}
              </div>
            )}

            {reservations.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-200">
                <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Aucune réservation pour l'instant</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="max-h-[72vh] overflow-auto rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-3">Client</th>
                      <th className="text-left px-4 py-3">Croisière</th>
                      <th className="text-left px-4 py-3">Dates</th>
                      <th className="text-left px-4 py-3">Pers.</th>
                      <th className="text-right px-4 py-3">Montant</th>
                      <th className="text-center px-4 py-3">Statut</th>
                      <th className="text-center px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reservations.slice().reverse().map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{r.nomClient}</div>
                          <div className="text-slate-500 text-xs">{r.emailClient}</div>
                          {r.telClient && <div className="text-slate-400 text-xs">{r.telClient}</div>}
                          {r.message && (
                            <div className="mt-1 max-w-[280px] rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 whitespace-pre-wrap break-words max-h-20 overflow-y-auto">
                              <span className="font-semibold">Note client:</span> {r.message}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium capitalize">{r.formule}</div>
                          <div className="text-slate-500 text-xs">{r.destination}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {(() => {
                            const debut = new Date(r.dateDebut);
                            const fin = new Date(r.dateFin);
                            const jours = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
                            const jourDebut = jours[debut.getUTCDay()];
                            const jourFin = jours[fin.getUTCDay()];
                            return (
                              <>
                                {jourDebut} {debut.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" })}
                                <br />→ {jourFin} {fin.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" })}
                              </>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center">{r.nbPersonnes}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-bold text-blue-900">{(r.montantTotal / 100).toLocaleString("fr-FR")} €</div>
                          <div className="text-slate-400 text-xs">Estimation</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const ws = r.workflowStatut || "demande";

                            if (ws === "solde_confirme") {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                                  <Check className="w-3 h-3" /> Solde versé
                                </span>
                              );
                            }

                            if (ws === "acompte_confirme") {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                                  <Check className="w-3 h-3" /> Validé (acompte reçu)
                                </span>
                              );
                            }

                            if (ws === "validee_owner" || ws === "contrat_envoye" || ws === "contrat_signe") {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                                  <FileText className="w-3 h-3" /> Devis et contrat envoyés
                                </span>
                              );
                            }

                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                                <Clock className="w-3 h-3" /> En attente de devis
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center flex-wrap">
                            <button
                              onClick={() => {
                                if (reservationActionLoadingId !== null) return;
                                setReservationFormData({
                                  nomClient: r.nomClient,
                                  emailClient: r.emailClient,
                                  telClient: r.telClient || "",
                                  nbPersonnes: r.nbPersonnes,
                                  formule: r.formule,
                                  destination: r.destination,
                                  dateDebut: new Date(r.dateDebut).toISOString().split("T")[0],
                                  dateFin: new Date(r.dateFin).toISOString().split("T")[0],
                                  montantTotal: r.montantTotal,
                                  typeReservation: r.typeReservation || "cabine",
                                  nbCabines: r.nbCabines || 1,
                                  statutPaiement: r.statutPaiement,
                                  workflowStatut: r.workflowStatut || "demande",
                                });
                                setEditingReservation(r);
                                setShowReservationForm(true);
                              }}
                              disabled={reservationActionLoadingId !== null}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Éditer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => generateQuoteAndContract(r.id)}
                              disabled={reservationActionLoadingId !== null}
                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Générer devis + contrat"
                            >
                              <Anchor className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                performReservationAction(
                                  r.id,
                                  () =>
                                    fetch(`/api/workflow/reservations/${r.id}/send-contract`, {
                                      method: "POST",
                                    }),
                                  "Contrat envoyé au client pour signature."
                                )
                              }
                              disabled={reservationActionLoadingId !== null}
                              className="p-2 text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Envoyer le contrat au client"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                performReservationAction(
                                  r.id,
                                  () =>
                                    fetch(`/api/workflow/reservations/${r.id}/acompte-received`, {
                                      method: "POST",
                                    }),
                                  "Acompte confirmé."
                                )
                              }
                              disabled={reservationActionLoadingId !== null}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Confirmer acompte reçu"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                performReservationAction(
                                  r.id,
                                  () =>
                                    fetch(`/api/workflow/reservations/${r.id}/contract-signed`, {
                                      method: "POST",
                                    }),
                                  "Contrat marqué comme signé."
                                )
                              }
                              disabled={reservationActionLoadingId !== null}
                              className="p-2 text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors"
                              title="Valider contrat signé"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                performReservationAction(
                                  r.id,
                                  () =>
                                    fetch(`/api/workflow/reservations/${r.id}/solde-received`, {
                                      method: "POST",
                                    }),
                                  "Solde confirmé."
                                )
                              }
                              disabled={reservationActionLoadingId !== null}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Confirmer solde reçu"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={async () => {
                                if (reservationActionLoadingId !== null) return;
                                if (confirm("Supprimer cette réservation ?")) {
                                  try {
                                    const res = await fetch(`/api/reservations/${r.id}`, {
                                      method: "DELETE",
                                    });
                                    if (res.ok) {
                                      await fetchReservations();
                                      await fetchDisponibilites();
                                      await fetchCabinesReservees();
                                    }
                                  } catch (e) {
                                    console.error(e);
                                  }
                                }
                              }}
                              disabled={reservationActionLoadingId !== null}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vue Calendrier */}
        {tab === "disponibilites" && (
          <>
            {/* Titre et bouton */}
            <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-blue-900 flex items-center gap-2">
              <Calendar className="w-8 h-8" />
              Calendrier 2025-2026
            </h2>
            <p className="text-slate-600 mt-1">Gérez les disponibilités et tarifs semaine par semaine</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-blue-900 text-white rounded-lg font-semibold hover:bg-blue-800 transition-colors shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Ajouter un produit
          </motion.button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <p className="text-xs uppercase text-slate-500">Total créneaux</p>
            <p className="text-2xl font-bold text-slate-900">{dispoStats.total}</p>
          </div>
          <div className="bg-white rounded-lg border border-teal-200 p-4">
            <p className="text-xs uppercase text-teal-700">Libres</p>
            <p className="text-2xl font-bold text-teal-800">{dispoStats.libres}</p>
          </div>
          <div className="bg-white rounded-lg border border-yellow-200 p-4">
            <p className="text-xs uppercase text-yellow-700">Partiellement remplis</p>
            <p className="text-2xl font-bold text-yellow-800">{dispoStats.partiels}</p>
          </div>
          <div className="bg-white rounded-lg border border-red-200 p-4">
            <p className="text-xs uppercase text-red-700">Bloqués / complets</p>
            <p className="text-2xl font-bold text-red-800">{dispoStats.bloques}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <p className="text-sm font-semibold text-slate-800 mb-3">Filtrer et retrouver un créneau</p>
          <div className="grid md:grid-cols-4 gap-3">
            <input
              type="text"
              value={searchDispo}
              onChange={(e) => setSearchDispo(e.target.value)}
              placeholder="Recherche destination ou note..."
              className="md:col-span-2 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
            <select
              value={filterPlanningType}
              onChange={(e) => setFilterPlanningType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
            >
              <option value="tous">Tous les types</option>
              <option value="charter">Charter / vente</option>
              <option value="technical_stop">Arrêt technique</option>
              <option value="blocked">Blocage manuel</option>
            </select>
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
            >
              <option value="tous">Tous les statuts</option>
              <option value="disponible">Libre</option>
              <option value="option">Partiellement rempli</option>
              <option value="reserve">Réservé / complet</option>
              <option value="ferme">Fermé</option>
            </select>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCalendarViewMode("list")}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                calendarViewMode === "list"
                  ? "bg-blue-900 text-white border-blue-900"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              Vue liste
            </button>
            <button
              type="button"
              onClick={() => setCalendarViewMode("calendar")}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                calendarViewMode === "calendar"
                  ? "bg-blue-900 text-white border-blue-900"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              Vue calendrier
            </button>
          </div>
        </div>

        {/* Formulaire */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-slate-200"
          >
            <h3 className="text-xl font-bold text-blue-900 mb-4">
              {editingId ? "Modifier la disponibilité" : "Nouvelle disponibilité"}
            </h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Début</label>
                <input
                  type="datetime-local"
                  required
                  value={formData.debut}
                  onChange={(e) => setFormData({ ...formData, debut: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fin</label>
                <input
                  type="datetime-local"
                  required
                  value={formData.fin}
                  onChange={(e) => setFormData({ ...formData, fin: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type planning</label>
                <select
                  value={formData.planningType}
                  onChange={(e) => setFormData({ ...formData, planningType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                >
                  <option value="charter">Charter / vente</option>
                  <option value="technical_stop">Arrêt technique</option>
                  <option value="blocked">Blocage manuel</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Destination</label>
                <select
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                >
                  <option>Méditerranée</option>
                  <option>La Ciotat</option>
                  <option>Canaries</option>
                  <option>Grenadines</option>
                  <option>Martinique / Grenadines</option>
                  <option>Traversée Atlantique</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                <select
                  value={formData.statut}
                  onChange={(e) => setFormData({ ...formData, statut: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                >
                  <option value="disponible">Disponible</option>
                  <option value="reserve">Réservé</option>
                  <option value="option">Option</option>
                  <option value="ferme">Fermé</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Prix semaine bateau entier (€)</label>
                <input
                  type="number"
                  value={formData.tarif}
                  onChange={(e) => setFormData({ ...formData, tarif: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  placeholder="15000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Prix semaine cabine double (€)</label>
                <input
                  type="number"
                  value={formData.tarifCabine}
                  onChange={(e) => setFormData({ ...formData, tarifCabine: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  placeholder="3900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Note privée (admin)</label>
                <input
                  type="text"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  placeholder="Visible uniquement dans l'admin"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Texte public (site)</label>
                <input
                  type="text"
                  value={formData.notePublique}
                  onChange={(e) => setFormData({ ...formData, notePublique: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  placeholder="Ex: Semaine Corse au départ d'Ajaccio"
                />
              </div>
              <div className="md:col-span-2 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-900 text-white rounded-lg font-semibold hover:bg-blue-800 transition-colors"
                >
                  {editingId ? "Mettre à jour" : "Créer"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-300 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Liste des disponibilités */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
            <p className="text-slate-600 mt-4">Chargement...</p>
          </div>
        ) : filteredDisponibilites.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-12 text-center border border-slate-200">
            <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 text-lg">Aucun créneau trouvé avec ces filtres</p>
            <button
              onClick={() => {
                setSearchDispo("");
                setFilterPlanningType("tous");
                setFilterStatut("tous");
              }}
              className="mt-4 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-300"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : calendarViewMode === "list" ? (
          <div className="grid gap-4">
            {filteredDisponibilites.map((dispo) => (
              <motion.div
                key={dispo.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-lg shadow border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatutColor(dispo.statut)}`}>
                        {getStatutLabel(dispo.statut)}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPlanningTypeColor(dispo.planningType)}`}>
                        {getPlanningTypeLabel(dispo.planningType)}
                      </span>
                      <span className="text-sm font-medium text-slate-600">{dispo.destination}</span>
                    </div>
                    <p className="text-sm text-slate-600">
                      {(() => {
                        const debut = new Date(dispo.debut);
                        const fin = new Date(dispo.fin);
                        const jours = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
                        const jourDebut = jours[debut.getUTCDay()];
                        const jourFin = jours[fin.getUTCDay()];
                        return `${jourDebut} ${debut.toLocaleDateString("fr-FR", { timeZone: "UTC" })} → ${jourFin} ${fin.toLocaleDateString("fr-FR", { timeZone: "UTC" })}`;
                      })()}
                    </p>
                    {dispo.tarif && (
                      <p className="text-lg font-bold text-blue-900 mt-1">
                        Bateau entier: {dispo.tarif.toLocaleString("fr-FR")} € / semaine
                      </p>
                    )}
                    {dispo.tarifCabine && (
                      <p className="text-xs text-slate-600 mt-1">
                        Cabine double: {dispo.tarifCabine.toLocaleString("fr-FR")} € / semaine
                      </p>
                    )}
                    {dispo.notePublique && (
                      <p className="text-xs text-blue-700 mt-1">{dispo.notePublique}</p>
                    )}
                    {dispo.note && (
                      <p className="text-xs text-slate-500 mt-1 italic">Privé: {dispo.note}</p>
                    )}
                    {cabinesMap[dispo.id] && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm font-semibold text-blue-900">
                          Cabines: {cabinesMap[dispo.id].nbReservees} / {cabinesMap[dispo.id].nbTotal} réservées
                        </p>
                        {cabinesMap[dispo.id].notes && (
                          <p className="text-xs text-slate-600 mt-1">{cabinesMap[dispo.id].notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingCabinesId(dispo.id);
                        const cabines = cabinesMap[dispo.id];
                        setCabinesFormData({
                          nbReservees: cabines?.nbReservees || 0,
                          nbTotal: cabines?.nbTotal || 4,
                          notes: cabines?.notes || "",
                        });
                        setShowCabinesForm(true);
                      }}
                      className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                      title="Gérer les cabines réservées"
                    >
                      <Anchor className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleEdit(dispo)}
                      className="p-2 text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(dispo.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div className="bg-white rounded-xl shadow border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  className="p-2 rounded-lg hover:bg-slate-100"
                  aria-label="Mois précédent"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-700" />
                </button>
                <h3 className="text-lg font-bold text-slate-900">
                  {calendarMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                </h3>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  className="p-2 rounded-lg hover:bg-slate-100"
                  aria-label="Mois suivant"
                >
                  <ChevronRight className="w-5 h-5 text-slate-700" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-2">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
                  <div key={label} className="text-xs font-semibold text-slate-500 text-center">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="aspect-square" />;
                  const dispo = findDispoForDate(day);
                  const isSelected =
                    selectedCalendarDispo &&
                    toDayStart(day) >= toDayStart(selectedCalendarDispo.debut) &&
                    toDayStart(day) <= toDayStart(selectedCalendarDispo.fin);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelectedCalendarDispo(dispo)}
                      className={`aspect-square rounded-lg border text-xs font-semibold transition-colors ${
                        dispo ? `${getStatutColor(dispo.statut)}` : "bg-slate-50 text-slate-400 border-slate-200"
                      } ${isSelected ? "ring-2 ring-blue-900 ring-offset-1" : ""}`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-slate-200 p-5 h-fit">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Détails du créneau</h3>
              {selectedCalendarDispo ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatutColor(selectedCalendarDispo.statut)}`}>
                      {getStatutLabel(selectedCalendarDispo.statut)}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getPlanningTypeColor(selectedCalendarDispo.planningType)}`}>
                      {getPlanningTypeLabel(selectedCalendarDispo.planningType)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Période</p>
                    <p className="font-semibold text-slate-900">
                      {new Date(selectedCalendarDispo.debut).toLocaleDateString("fr-FR", { timeZone: "UTC" })} →{" "}
                      {new Date(selectedCalendarDispo.fin).toLocaleDateString("fr-FR", { timeZone: "UTC" })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Destination</p>
                    <p className="font-semibold text-slate-900">{selectedCalendarDispo.destination}</p>
                  </div>
                  {selectedCalendarDispo.tarif && (
                    <div>
                      <p className="text-xs uppercase text-slate-500">Tarif semaine</p>
                      <p className="font-semibold text-slate-900">{selectedCalendarDispo.tarif.toLocaleString("fr-FR")} €</p>
                    </div>
                  )}
                  {selectedCalendarDispo.tarifCabine && (
                    <div>
                      <p className="text-xs uppercase text-slate-500">Tarif cabine</p>
                      <p className="font-semibold text-slate-900">{selectedCalendarDispo.tarifCabine.toLocaleString("fr-FR")} €</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase text-slate-500">Cabines disponibles</p>
                    <p className="font-semibold text-slate-900">
                      {selectedDispoMetrics.availableCabines} / {selectedDispoMetrics.totalCabines}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Total encaissé</p>
                    <p className="font-semibold text-emerald-700">
                      {(selectedDispoMetrics.totalEncaissedCents / 100).toLocaleString("fr-FR")} €
                    </p>
                  </div>
                  {selectedCalendarDispo.notePublique && (
                    <p className="text-xs text-blue-700">{selectedCalendarDispo.notePublique}</p>
                  )}
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-xs uppercase text-slate-500 mb-2">Réservations sur cette semaine</p>
                    {selectedDispoReservations.length === 0 ? (
                      <p className="text-xs text-slate-500">Aucune réservation liée à ce créneau.</p>
                    ) : (
                      <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                        {selectedDispoReservations.map((r) => (
                          <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-sm font-semibold text-slate-900">{r.nomClient}</p>
                            <p className="text-xs text-slate-600">
                              {r.nbPersonnes} pers. •{" "}
                              {r.typeReservation === "bateau_entier" ? "Privatif" : r.typeReservation === "cabine" ? "Cabine" : "Place"}
                            </p>
                            <p className="text-xs text-slate-500">
                              Statut: {r.workflowStatut || "demande"} • {(r.montantTotal / 100).toLocaleString("fr-FR")} €
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleEdit(selectedCalendarDispo)}
                      className="px-3 py-2 text-sm rounded-lg bg-blue-50 text-blue-900 hover:bg-blue-100"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(selectedCalendarDispo.id)}
                      className="px-3 py-2 text-sm rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Cliquez sur une semaine dans le calendrier pour afficher ses détails.</p>
              )}
            </div>
          </div>
        )}
          </>
        )}

      </main>

      {/* Modal de gestion des cabines */}
      {showCabinesForm && editingCabinesId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
          >
            <h3 className="text-lg font-bold text-blue-900 mb-4">Gérer les cabines réservées</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await fetch("/api/cabines-reservees", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      disponibiliteId: editingCabinesId,
                      ...cabinesFormData,
                    }),
                  });
                  if (res.ok) {
                    setShowCabinesForm(false);
                    setEditingCabinesId(null);
                    fetchCabinesReservees();
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cabines réservées</label>
                <input
                  type="number"
                  min="0"
                  value={cabinesFormData.nbReservees}
                  onChange={(e) =>
                    setCabinesFormData({ ...cabinesFormData, nbReservees: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total de cabines</label>
                <input
                  type="number"
                  min="1"
                  value={cabinesFormData.nbTotal}
                  onChange={(e) =>
                    setCabinesFormData({ ...cabinesFormData, nbTotal: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (ex: 3 doubles + 1 simple)</label>
                <textarea
                  value={cabinesFormData.notes}
                  onChange={(e) =>
                    setCabinesFormData({ ...cabinesFormData, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 resize-none"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCabinesForm(false);
                    setEditingCabinesId(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 font-medium"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal d'édition des réservations */}
      {showReservationForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-bold text-blue-900 mb-4">
              {editingReservation ? "Éditer la réservation" : "Ajouter une réservation"}
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  if (!reservationFormData.nomClient || !reservationFormData.emailClient) {
                    alert("Nom client et email sont obligatoires.");
                    return;
                  }
                  if (!reservationFormData.dateDebut || !reservationFormData.dateFin) {
                    alert("Date de début et date de fin sont obligatoires.");
                    return;
                  }
                  if (!reservationFormData.montantTotal || Number(reservationFormData.montantTotal) <= 0) {
                    alert("Le montant total doit être supérieur à 0.");
                    return;
                  }
                  const payload = {
                    ...reservationFormData,
                    montantTotal: Math.round(Number(reservationFormData.montantTotal || 0)),
                  };
                  const selectedTypeReservation =
                    payload.typeReservation === "bateau_entier" || payload.typeReservation === "cabine" || payload.typeReservation === "place"
                      ? payload.typeReservation
                      : "cabine";
                  const safeNbPersonnes = Math.max(1, Math.min(8, Number(payload.nbPersonnes || 1)));
                  const computedNbCabines =
                    selectedTypeReservation === "cabine"
                      ? Math.max(1, Math.ceil(safeNbPersonnes / 2))
                      : selectedTypeReservation === "bateau_entier"
                        ? 1
                        : Math.max(1, Number(payload.nbCabines || 1));
                  const res = editingReservation
                    ? await fetch(`/api/reservations/${editingReservation.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          ...payload,
                          nbPersonnes: safeNbPersonnes,
                          typeReservation: selectedTypeReservation,
                          nbCabines: computedNbCabines,
                        }),
                      })
                    : await fetch("/api/reservations/request", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          nomClient: payload.nomClient,
                          emailClient: payload.emailClient,
                          telClient: payload.telClient,
                          nbPersonnes: safeNbPersonnes,
                          formule: payload.formule || "semaine",
                          destination: payload.destination || "Mediterranee",
                          dateDebut: `${payload.dateDebut || new Date().toISOString().split("T")[0]}T00:00:00.000Z`,
                          dateFin: `${payload.dateFin || new Date().toISOString().split("T")[0]}T00:00:00.000Z`,
                          montantTotal: Math.round(Number(payload.montantTotal || 0)),
                          typeReservation: selectedTypeReservation,
                          nbCabines: computedNbCabines,
                          message: payload.message || "",
                          disponibiliteId: null,
                        }),
                      });
                  if (!res.ok) {
                    throw new Error(await readErrorMessage(res, "Impossible d'enregistrer la réservation"));
                  }
                  setShowReservationForm(false);
                  setEditingReservation(null);
                  await fetchReservations();
                  setReservationActionMessage(editingReservation ? "Réservation mise à jour." : "Réservation ajoutée.");
                } catch (e: any) {
                  console.error(e);
                  alert(e?.message || "Erreur lors de l'enregistrement");
                }
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom client</label>
                  <input
                    type="text"
                    value={reservationFormData.nomClient || ""}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, nomClient: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={reservationFormData.emailClient || ""}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, emailClient: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={reservationFormData.telClient || ""}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, telClient: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nb personnes</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={reservationFormData.nbPersonnes || 1}
                    onChange={(e) =>
                      setReservationFormData({
                        ...reservationFormData,
                        nbPersonnes: Math.max(1, Math.min(8, parseInt(e.target.value || "1", 10))),
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Destination</label>
                  <input
                    type="text"
                    value={reservationFormData.destination || ""}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, destination: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Formule</label>
                  <input
                    type="text"
                    value={reservationFormData.formule || ""}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, formule: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type de réservation</label>
                  <select
                    value={reservationFormData.typeReservation || "cabine"}
                    onChange={(e) =>
                      setReservationFormData({
                        ...reservationFormData,
                        typeReservation: e.target.value as "bateau_entier" | "cabine" | "place",
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  >
                    <option value="cabine">Cabine</option>
                    <option value="bateau_entier">Privatif (bateau entier)</option>
                    <option value="place">Place</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Note client</label>
                  <textarea
                    value={reservationFormData.message || ""}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, message: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 resize-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date début</label>
                  <input
                    type="date"
                    value={reservationFormData.dateDebut || ""}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, dateDebut: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date fin</label>
                  <input
                    type="date"
                    value={reservationFormData.dateFin || ""}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, dateFin: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Montant (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={(reservationFormData.montantTotal as any) / 100 || 0}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, montantTotal: parseFloat(e.target.value) * 100 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                  <select
                    value={reservationFormData.workflowStatut || "demande"}
                    onChange={(e) => setReservationFormData({ ...reservationFormData, workflowStatut: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900"
                  >
                    <option value="demande">En attente de devis</option>
                    <option value="validee_owner">Devis et contrat envoyés</option>
                    <option value="acompte_confirme">Validé (acompte reçu)</option>
                    <option value="solde_confirme">Solde versé</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowReservationForm(false);
                    setEditingReservation(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 font-medium"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
