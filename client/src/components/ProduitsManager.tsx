import { useEffect, useMemo, useState } from "react";
import { Calendar, PhoneCall, Save, Trash2 } from "lucide-react";

type ProductKey = "croisiere_mediterranee" | "transatlantique" | "croisiere_caraibes";
type Statut = "disponible" | "reserve" | "option" | "ferme";

type Disponibilite = {
  id: number;
  planningType?: "charter" | "technical_stop" | "maintenance" | "blocked";
  debut: string;
  fin: string;
  statut: Statut;
  tarif: number | null;
  tarifCabine?: number | null;
  tarifJourPersonne?: number | null;
  tarifJourPriva?: number | null;
  destination: string;
  notePublique?: string | null;
};

type Cabines = {
  disponibiliteId: number;
  nbReservees: number;
  nbTotal: number;
  notes?: string | null;
};

const PRODUCTS: Record<ProductKey, { label: string; destination: string; formule: string }> = {
  croisiere_mediterranee: { label: "Croisières Med", destination: "Méditerranée", formule: "croisiere_mediterranee" },
  transatlantique: { label: "Transatlantique", destination: "Traversée Atlantique", formule: "transatlantique" },
  croisiere_caraibes: { label: "Croisières Caraïbes", destination: "Grenadines", formule: "croisiere_caraibes" },
};

function isoDay(d: string) {
  return new Date(d).toISOString().split("T")[0];
}

function classifyProduct(dispo: Disponibilite): ProductKey | null {
  const dest = (dispo.destination || "").toLowerCase();
  const d = new Date(dispo.debut);
  const month = d.getUTCMonth() + 1;
  if (dest.includes("travers") || dest.includes("transat")) return "transatlantique";
  if (dest.includes("grenadine") || dest.includes("cara")) return "croisiere_caraibes";
  if (month >= 5 && month <= 9) return "croisiere_mediterranee";
  return null;
}

export default function ProduitsManager() {
  const [product, setProduct] = useState<ProductKey>("croisiere_mediterranee");
  const [dispos, setDispos] = useState<Disponibilite[]>([]);
  const [cabines, setCabines] = useState<Record<number, Cabines>>({});
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [slotForm, setSlotForm] = useState({
    debut: "",
    fin: "",
    statut: "disponible" as Statut,
    tarif: "",
    tarifCabine: "",
    tarifJourPersonne: "",
    tarifJourPriva: "",
    notePublique: "",
  });

  const [manualForm, setManualForm] = useState({
    nomClient: "",
    emailClient: "",
    telClient: "",
    nbPersonnes: 2,
    nbCabines: 1,
    typeReservation: "cabine" as "bateau_entier" | "cabine" | "place",
    dateDebut: "",
    dateFin: "",
    montantTotalEur: 0,
    message: "Réservation prise par téléphone",
  });
  const [deletePeriod, setDeletePeriod] = useState({ debut: "", fin: "" });

  const fetchData = async () => {
    const [dRes, cRes] = await Promise.all([fetch("/api/disponibilites"), fetch("/api/cabines-reservees")]);
    const dData = dRes.ok ? await dRes.json() : [];
    const cData = cRes.ok ? await cRes.json() : [];
    setDispos(Array.isArray(dData) ? dData : []);
    const map: Record<number, Cabines> = {};
    for (const c of cData) map[c.disponibiliteId] = c;
    setCabines(map);
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const productSlots = useMemo(
    () => dispos.filter((d) => d.planningType === "charter" && classifyProduct(d) === product).sort((a, b) => +new Date(a.debut) - +new Date(b.debut)),
    [dispos, product]
  );

  const createSlot = async () => {
    try {
      const payload = {
        planningType: "charter",
        debut: new Date(slotForm.debut).toISOString(),
        fin: new Date(slotForm.fin).toISOString(),
        statut: slotForm.statut,
        destination: PRODUCTS[product].destination,
        tarif: slotForm.tarif ? parseInt(slotForm.tarif, 10) : null,
        tarifCabine: slotForm.tarifCabine ? parseInt(slotForm.tarifCabine, 10) : null,
        tarifJourPersonne: slotForm.tarifJourPersonne ? parseInt(slotForm.tarifJourPersonne, 10) : null,
        tarifJourPriva: slotForm.tarifJourPriva ? parseInt(slotForm.tarifJourPriva, 10) : null,
        notePublique: slotForm.notePublique || null,
      };
      const res = await fetch("/api/disponibilites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Impossible de créer le créneau");
      setMessage("Créneau produit créé.");
      setSlotForm({
        debut: "",
        fin: "",
        statut: "disponible",
        tarif: "",
        tarifCabine: "",
        tarifJourPersonne: "",
        tarifJourPriva: "",
        notePublique: "",
      });
      await fetchData();
    } catch (e: any) {
      setMessage(e?.message || "Erreur création créneau");
    }
  };

  const saveCabines = async (disponibiliteId: number, nbReservees: number, nbTotal: number) => {
    await fetch("/api/cabines-reservees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disponibiliteId, nbReservees, nbTotal }),
    });
    await fetchData();
  };

  const createManualReservation = async () => {
    try {
      const amountCents = Math.round((manualForm.montantTotalEur || 0) * 100);
      const res = await fetch("/api/reservations/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomClient: manualForm.nomClient,
          emailClient: manualForm.emailClient,
          telClient: manualForm.telClient,
          nbPersonnes: manualForm.nbPersonnes,
          formule: PRODUCTS[product].formule,
          destination: PRODUCTS[product].destination,
          dateDebut: `${manualForm.dateDebut}T00:00:00.000Z`,
          dateFin: `${manualForm.dateFin}T00:00:00.000Z`,
          montantTotal: amountCents,
          typeReservation: manualForm.typeReservation,
          nbCabines: manualForm.nbCabines,
          message: manualForm.message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Impossible de créer la réservation");
      setMessage("Réservation manuelle ajoutée.");
      await fetchData();
    } catch (e: any) {
      setMessage(e?.message || "Erreur réservation manuelle");
    }
  };

  const deleteSlot = async (id: number) => {
    const ok = window.confirm("Supprimer ce créneau produit ?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/disponibilites/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Suppression impossible");
      setMessage("Créneau supprimé.");
      await fetchData();
    } catch (e: any) {
      setMessage(e?.message || "Erreur suppression");
    }
  };

  const deleteProductPeriod = async () => {
    if (!deletePeriod.debut || !deletePeriod.fin) {
      setMessage("Choisissez une date de début et de fin.");
      return;
    }
    if (deletePeriod.debut > deletePeriod.fin) {
      setMessage("La date de début doit être antérieure à la date de fin.");
      return;
    }

    const targets = productSlots.filter((d) => {
      const start = isoDay(d.debut);
      const end = isoDay(d.fin);
      return end >= deletePeriod.debut && start <= deletePeriod.fin;
    });

    if (targets.length === 0) {
      setMessage("Aucun créneau à supprimer sur cette période.");
      return;
    }

    const confirmText = `Supprimer ${targets.length} créneau(x) de ${PRODUCTS[product].label} entre ${deletePeriod.debut} et ${deletePeriod.fin} ?`;
    if (!window.confirm(confirmText)) return;

    setDeleting(true);
    try {
      for (const t of targets) {
        const res = await fetch(`/api/disponibilites/${t.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Suppression impossible (id ${t.id})`);
        }
      }
      setMessage(`${targets.length} créneau(x) supprimé(s).`);
      setDeletePeriod({ debut: "", fin: "" });
      await fetchData();
    } catch (e: any) {
      setMessage(e?.message || "Erreur suppression en masse");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-blue-900">Produits</h2>
        <p className="text-slate-600 mt-1">Gérez vos offres, créneaux, tarifs, cabines disponibles et réservations téléphone.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(PRODUCTS) as ProductKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setProduct(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${product === k ? "bg-blue-900 text-white" : "bg-white border border-slate-200 text-slate-700"}`}
          >
            {PRODUCTS[k].label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" />Nouveau créneau produit</h3>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={slotForm.debut} onChange={(e) => setSlotForm((s) => ({ ...s, debut: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input type="date" value={slotForm.fin} onChange={(e) => setSlotForm((s) => ({ ...s, fin: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <select value={slotForm.statut} onChange={(e) => setSlotForm((s) => ({ ...s, statut: e.target.value as Statut }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="disponible">Disponible</option>
              <option value="option">Option</option>
              <option value="reserve">Réservé</option>
              <option value="ferme">Fermé</option>
            </select>
            <input type="number" placeholder="Tarif semaine (€)" value={slotForm.tarif} onChange={(e) => setSlotForm((s) => ({ ...s, tarif: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input type="number" placeholder="Tarif cabine (€)" value={slotForm.tarifCabine} onChange={(e) => setSlotForm((s) => ({ ...s, tarifCabine: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input type="number" placeholder="Tarif jour / pers (€)" value={slotForm.tarifJourPersonne} onChange={(e) => setSlotForm((s) => ({ ...s, tarifJourPersonne: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input type="number" placeholder="Tarif jour / priva (€)" value={slotForm.tarifJourPriva} onChange={(e) => setSlotForm((s) => ({ ...s, tarifJourPriva: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="Texte public" value={slotForm.notePublique} onChange={(e) => setSlotForm((s) => ({ ...s, notePublique: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm col-span-2" />
          </div>
          <button onClick={createSlot} className="mt-3 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold flex items-center gap-2"><Save className="w-4 h-4" />Enregistrer créneau</button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2"><PhoneCall className="w-4 h-4" />Réservation manuelle (téléphone)</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nom client" value={manualForm.nomClient} onChange={(e) => setManualForm((s) => ({ ...s, nomClient: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="Email client" value={manualForm.emailClient} onChange={(e) => setManualForm((s) => ({ ...s, emailClient: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="Téléphone" value={manualForm.telClient} onChange={(e) => setManualForm((s) => ({ ...s, telClient: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <select value={manualForm.typeReservation} onChange={(e) => setManualForm((s) => ({ ...s, typeReservation: e.target.value as any }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="bateau_entier">Privatif</option>
              <option value="cabine">Cabine</option>
              <option value="place">Place</option>
            </select>
            <input type="number" min={1} value={manualForm.nbPersonnes} onChange={(e) => setManualForm((s) => ({ ...s, nbPersonnes: parseInt(e.target.value || "1", 10) }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Nb personnes" />
            <input type="number" min={1} value={manualForm.nbCabines} onChange={(e) => setManualForm((s) => ({ ...s, nbCabines: parseInt(e.target.value || "1", 10) }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="Nb cabines/places" />
            <input type="date" value={manualForm.dateDebut} onChange={(e) => setManualForm((s) => ({ ...s, dateDebut: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input type="date" value={manualForm.dateFin} onChange={(e) => setManualForm((s) => ({ ...s, dateFin: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input type="number" min={0} value={manualForm.montantTotalEur} onChange={(e) => setManualForm((s) => ({ ...s, montantTotalEur: parseFloat(e.target.value || "0") }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm col-span-2" placeholder="Montant total (€)" />
          </div>
          <button onClick={createManualReservation} className="mt-3 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold">Ajouter réservation manuelle</button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-bold text-blue-900 mb-3">Créneaux existants — {PRODUCTS[product].label}</h3>
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-900 mb-2">Supprimer une période</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={deletePeriod.debut}
              onChange={(e) => setDeletePeriod((s) => ({ ...s, debut: e.target.value }))}
              className="px-3 py-2 border border-red-200 rounded-lg text-sm"
            />
            <input
              type="date"
              value={deletePeriod.fin}
              onChange={(e) => setDeletePeriod((s) => ({ ...s, fin: e.target.value }))}
              className="px-3 py-2 border border-red-200 rounded-lg text-sm"
            />
            <button
              onClick={deleteProductPeriod}
              disabled={deleting}
              className="px-3 py-2 bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Suppression..." : "Supprimer période"}
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {productSlots.map((d) => {
            const cab = cabines[d.id] || { disponibiliteId: d.id, nbReservees: 0, nbTotal: 4 };
            return (
              <div key={d.id} className="p-3 rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-semibold">{isoDay(d.debut)} → {isoDay(d.fin)} · {d.statut}</p>
                    <p className="text-slate-600 text-xs">
                      Tarif sem: {d.tarif ?? "—"}€ · Cabine: {d.tarifCabine ?? "—"}€ · Jour/pers: {d.tarifJourPersonne ?? "—"}€ · Jour/priva: {d.tarifJourPriva ?? "—"}€
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={cab.nbReservees}
                      onChange={(e) => setCabines((m) => ({ ...m, [d.id]: { ...cab, nbReservees: parseInt(e.target.value || "0", 10) } }))}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-xs"
                      title="Cabines réservées"
                    />
                    <span className="text-xs text-slate-500">/</span>
                    <input
                      type="number"
                      min={1}
                      value={cab.nbTotal}
                      onChange={(e) => setCabines((m) => ({ ...m, [d.id]: { ...cab, nbTotal: parseInt(e.target.value || "1", 10) } }))}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-xs"
                      title="Total cabines"
                    />
                    <button onClick={() => saveCabines(d.id, cab.nbReservees, cab.nbTotal)} className="px-3 py-1 bg-slate-100 rounded text-xs">Cabines</button>
                    <button
                      onClick={() => deleteSlot(d.id)}
                      className="px-3 py-1 bg-red-100 text-red-800 rounded text-xs flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {productSlots.length === 0 && <p className="text-sm text-slate-500">Aucun créneau pour ce produit.</p>}
        </div>
      </div>

      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}

