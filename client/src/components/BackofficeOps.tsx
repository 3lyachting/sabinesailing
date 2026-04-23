import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wrench, Users, FileText } from "lucide-react";

type CrewMember = {
  id: number;
  fullName: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  certifications?: string | null;
  availabilityNote?: string | null;
};

type MaintenanceTask = {
  id: number;
  title: string;
  system: string;
  boatArea?: string | null;
  intervalHours?: number | null;
  intervalDays?: number | null;
  lastDoneEngineHours?: number | null;
  currentEngineHours?: number | null;
  lastDoneAt?: string | null;
  nextDueAt?: string | null;
  sparePartsLocation?: string | null;
  boatPlanRef?: string | null;
  procedureNote?: string | null;
  isCritical: boolean;
  isDone: boolean;
};

type BoatDoc = {
  id: number;
  docType: string;
  originalName: string;
  expiresAt?: string | null;
};

export default function BackofficeOps({ mode }: { mode: "documents" | "crew" | "maintenance" }) {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [boatDocs, setBoatDocs] = useState<BoatDoc[]>([]);
  const [message, setMessage] = useState("");

  const [crewForm, setCrewForm] = useState({
    fullName: "",
    role: "",
    phone: "",
    email: "",
    certifications: "",
    availabilityNote: "",
  });

  const [taskForm, setTaskForm] = useState({
    title: "",
    system: "",
    boatArea: "",
    intervalHours: "",
    intervalDays: "",
    lastDoneEngineHours: "",
    currentEngineHours: "",
    lastDoneAt: "",
    nextDueAt: "",
    sparePartsLocation: "",
    boatPlanRef: "",
    procedureNote: "",
    isCritical: false,
  });

  const [docForm, setDocForm] = useState({
    docType: "assurance",
    expiresAt: "",
  });
  const [docTypeOptions, setDocTypeOptions] = useState([
    { value: "assurance", label: "Assurance" },
    { value: "immatriculation", label: "Immatriculation" },
    { value: "controle", label: "Contrôle" },
    { value: "plan_bateau", label: "Plan du bateau" },
    { value: "piece_rechange", label: "Pièce / notice" },
  ]);
  const [showAddDocType, setShowAddDocType] = useState(false);
  const [newDocTypeLabel, setNewDocTypeLabel] = useState("");

  const readApiError = async (res: Response, fallback: string) => {
    try {
      const payload = await res.json();
      return payload?.error || fallback;
    } catch {
      return fallback;
    }
  };

  const loadData = async () => {
    try {
      if (mode === "crew") {
        const res = await fetch("/api/backoffice-ops/crew");
        if (res.ok) setCrew(await res.json());
      } else if (mode === "maintenance") {
        const res = await fetch("/api/backoffice-ops/maintenance/tasks");
        if (res.ok) setTasks(await res.json());
      } else if (mode === "documents") {
        const res = await fetch("/api/admin-documents/boat");
        if (res.ok) setBoatDocs(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadData();
  }, [mode]);

  const maintenanceStats = useMemo(() => {
    const dueNow = tasks.filter((t) => {
      if (t.isDone) return false;
      const dueByDate = t.nextDueAt ? new Date(t.nextDueAt).getTime() <= Date.now() : false;
      const dueByHours =
        t.intervalHours &&
        t.currentEngineHours !== null &&
        t.currentEngineHours !== undefined &&
        t.lastDoneEngineHours !== null &&
        t.lastDoneEngineHours !== undefined
          ? t.currentEngineHours - t.lastDoneEngineHours >= t.intervalHours
          : false;
      return Boolean(dueByDate || dueByHours);
    }).length;
    const criticalOpen = tasks.filter((t) => t.isCritical && !t.isDone).length;
    return { dueNow, criticalOpen };
  }, [tasks]);

  if (mode === "crew") {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-blue-900 flex items-center gap-2">
            <Users className="w-8 h-8" />
            Équipage
          </h2>
          <p className="text-slate-600 mt-1">Gestion des membres d'équipage, rôles et certifications.</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="grid md:grid-cols-3 gap-3">
            <input value={crewForm.fullName} onChange={(e) => setCrewForm((s) => ({ ...s, fullName: e.target.value }))} placeholder="Nom complet" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={crewForm.role} onChange={(e) => setCrewForm((s) => ({ ...s, role: e.target.value }))} placeholder="Rôle (Capitaine, Second...)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={crewForm.phone} onChange={(e) => setCrewForm((s) => ({ ...s, phone: e.target.value }))} placeholder="Téléphone" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={crewForm.email} onChange={(e) => setCrewForm((s) => ({ ...s, email: e.target.value }))} placeholder="Email" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={crewForm.certifications} onChange={(e) => setCrewForm((s) => ({ ...s, certifications: e.target.value }))} placeholder="Certifications" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
          </div>
          <textarea value={crewForm.availabilityNote} onChange={(e) => setCrewForm((s) => ({ ...s, availabilityNote: e.target.value }))} placeholder="Notes de disponibilité" className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" rows={2} />
          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/backoffice-ops/crew", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(crewForm),
                });
                if (!res.ok) throw new Error(await readApiError(res, "Création impossible"));
                setCrewForm({ fullName: "", role: "", phone: "", email: "", certifications: "", availabilityNote: "" });
                setMessage("Membre d'équipage ajouté.");
                await loadData();
              } catch (e: any) {
                setMessage(e?.message || "Erreur création équipage");
              }
            }}
            className="mt-3 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Ajouter
          </button>
        </div>

        <div className="grid gap-3">
          {crew.map((c) => (
            <div key={c.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-900">{c.fullName}</p>
                <p className="text-xs text-slate-600">{c.role}</p>
                <p className="text-xs text-slate-500">{[c.phone, c.email].filter(Boolean).join(" · ")}</p>
                {c.certifications && <p className="text-xs text-slate-500 mt-1">Certif: {c.certifications}</p>}
                {c.availabilityNote && <p className="text-xs text-slate-500 mt-1">{c.availabilityNote}</p>}
              </div>
              <button
                onClick={async () => {
                  await fetch(`/api/backoffice-ops/crew/${c.id}`, { method: "DELETE" });
                  await loadData();
                }}
                className="p-2 text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
      </div>
    );
  }

  if (mode === "maintenance") {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-blue-900 flex items-center gap-2">
            <Wrench className="w-8 h-8" />
            Maintenance bateau
          </h2>
          <p className="text-slate-600 mt-1">Plan d'entretien, échéances heures/jours, localisation des pièces et références plans.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase">Tâches en retard / dues</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{maintenanceStats.dueNow}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase">Tâches critiques ouvertes</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{maintenanceStats.criticalOpen}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase">Total tâches</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">{tasks.length}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="grid md:grid-cols-3 gap-3">
            <input value={taskForm.title} onChange={(e) => setTaskForm((s) => ({ ...s, title: e.target.value }))} placeholder="Tâche (ex: Vidange moteur tribord)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
            <input value={taskForm.system} onChange={(e) => setTaskForm((s) => ({ ...s, system: e.target.value }))} placeholder="Système" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={taskForm.boatArea} onChange={(e) => setTaskForm((s) => ({ ...s, boatArea: e.target.value }))} placeholder="Zone bateau" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={taskForm.intervalHours} onChange={(e) => setTaskForm((s) => ({ ...s, intervalHours: e.target.value }))} placeholder="Intervalle heures (ex: 500)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={taskForm.intervalDays} onChange={(e) => setTaskForm((s) => ({ ...s, intervalDays: e.target.value }))} placeholder="Intervalle jours (ex: 365)" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={taskForm.lastDoneEngineHours} onChange={(e) => setTaskForm((s) => ({ ...s, lastDoneEngineHours: e.target.value }))} placeholder="Heures moteur au dernier entretien" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={taskForm.currentEngineHours} onChange={(e) => setTaskForm((s) => ({ ...s, currentEngineHours: e.target.value }))} placeholder="Heures moteur actuelles" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input type="date" value={taskForm.lastDoneAt} onChange={(e) => setTaskForm((s) => ({ ...s, lastDoneAt: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input type="date" value={taskForm.nextDueAt} onChange={(e) => setTaskForm((s) => ({ ...s, nextDueAt: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input value={taskForm.sparePartsLocation} onChange={(e) => setTaskForm((s) => ({ ...s, sparePartsLocation: e.target.value }))} placeholder="Emplacement pièces de rechange" className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2" />
            <input value={taskForm.boatPlanRef} onChange={(e) => setTaskForm((s) => ({ ...s, boatPlanRef: e.target.value }))} placeholder="Référence plan du bateau" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <textarea value={taskForm.procedureNote} onChange={(e) => setTaskForm((s) => ({ ...s, procedureNote: e.target.value }))} placeholder="Procédure / notes maintenance" className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" rows={2} />
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={taskForm.isCritical} onChange={(e) => setTaskForm((s) => ({ ...s, isCritical: e.target.checked }))} />
            Tâche critique
          </label>
          <div>
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/backoffice-ops/maintenance/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(taskForm),
                  });
                  if (!res.ok) throw new Error(await readApiError(res, "Création tâche impossible"));
                  setTaskForm({
                    title: "",
                    system: "",
                    boatArea: "",
                    intervalHours: "",
                    intervalDays: "",
                    lastDoneEngineHours: "",
                    currentEngineHours: "",
                    lastDoneAt: "",
                    nextDueAt: "",
                    sparePartsLocation: "",
                    boatPlanRef: "",
                    procedureNote: "",
                    isCritical: false,
                  });
                  setMessage("Tâche maintenance ajoutée.");
                  await loadData();
                } catch (e: any) {
                  setMessage(e?.message || "Erreur création tâche");
                }
              }}
              className="mt-3 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Ajouter tâche
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          {tasks.map((t) => {
            const dueByHours =
              t.intervalHours &&
              t.currentEngineHours !== null &&
              t.currentEngineHours !== undefined &&
              t.lastDoneEngineHours !== null &&
              t.lastDoneEngineHours !== undefined
                ? t.currentEngineHours - t.lastDoneEngineHours >= t.intervalHours
                : false;
            const dueByDate = t.nextDueAt ? new Date(t.nextDueAt).getTime() <= Date.now() : false;
            const isDue = !t.isDone && (dueByHours || dueByDate);
            return (
              <div key={t.id} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-600">{t.system}{t.boatArea ? ` · ${t.boatArea}` : ""}</p>
                    {t.intervalHours && (
                      <p className="text-xs text-slate-500 mt-1">
                        Intervalle: {t.intervalHours}h · Dernier: {t.lastDoneEngineHours ?? "?"}h · Actuel: {t.currentEngineHours ?? "?"}h
                      </p>
                    )}
                    {t.intervalDays && (
                      <p className="text-xs text-slate-500">Intervalle calendrier: {t.intervalDays} jours</p>
                    )}
                    {t.sparePartsLocation && <p className="text-xs text-slate-500 mt-1">Pièces: {t.sparePartsLocation}</p>}
                    {t.boatPlanRef && <p className="text-xs text-slate-500">Plan: {t.boatPlanRef}</p>}
                    {t.procedureNote && <p className="text-xs text-slate-500 mt-1">{t.procedureNote}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-[10px] uppercase px-2 py-1 rounded-full ${t.isDone ? "bg-green-100 text-green-700" : isDue ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {t.isDone ? "Fait" : isDue ? "À faire" : "Planifié"}
                    </span>
                    {t.isCritical && <span className="text-[10px] uppercase px-2 py-1 rounded-full bg-red-100 text-red-700">Critique</span>}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          await fetch(`/api/backoffice-ops/maintenance/tasks/${t.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isDone: !t.isDone }),
                          });
                          await loadData();
                        }}
                        className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700"
                      >
                        {t.isDone ? "Rouvrir" : "Marquer fait"}
                      </button>
                      <button
                        onClick={async () => {
                          await fetch(`/api/backoffice-ops/maintenance/tasks/${t.id}`, { method: "DELETE" });
                          await loadData();
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-blue-900 flex items-center gap-2">
          <FileText className="w-8 h-8" />
          Documents bateau
        </h2>
        <p className="text-slate-600 mt-1">Registre des documents techniques et administratifs du navire.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select value={docForm.docType} onChange={(e) => setDocForm((s) => ({ ...s, docType: e.target.value }))} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
                {docTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddDocType((v) => !v)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-blue-900 hover:bg-blue-50 whitespace-nowrap"
              >
                + Ajouter
              </button>
            </div>
            {showAddDocType && (
              <div className="flex items-center gap-2">
                <input
                  value={newDocTypeLabel}
                  onChange={(e) => setNewDocTypeLabel(e.target.value)}
                  placeholder="Nouveau type de document"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const label = newDocTypeLabel.trim();
                    if (!label) return;
                    const value = label
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/[^a-z0-9]+/g, "_")
                      .replace(/^_+|_+$/g, "");
                    if (!value) return;
                    if (!docTypeOptions.some((opt) => opt.value === value)) {
                      setDocTypeOptions((opts) => [...opts, { value, label }]);
                    }
                    setDocForm((s) => ({ ...s, docType: value }));
                    setNewDocTypeLabel("");
                    setShowAddDocType(false);
                  }}
                  className="px-3 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold"
                >
                  OK
                </button>
              </div>
            )}
          </div>
          <input type="date" value={docForm.expiresAt} onChange={(e) => setDocForm((s) => ({ ...s, expiresAt: e.target.value }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <label className="px-3 py-2 border border-slate-300 rounded-lg text-sm cursor-pointer text-center">
            Téléverser
            <input
              type="file"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const base64 = await new Promise<string>((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
                    fr.onerror = reject;
                    fr.readAsDataURL(file);
                  });
                  const res = await fetch("/api/admin-documents/boat/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      docType: docForm.docType,
                      originalName: file.name,
                      mimeType: file.type || "application/octet-stream",
                      base64Data: base64,
                      expiresAt: docForm.expiresAt || null,
                    }),
                  });
                  if (!res.ok) throw new Error(await readApiError(res, "Upload impossible"));
                  setMessage("Document bateau ajouté.");
                  await loadData();
                } catch (err: any) {
                  setMessage(err?.message || "Erreur upload document");
                }
              }}
            />
          </label>
        </div>
      </div>

      <div className="grid gap-3">
        {boatDocs.map((d) => (
          <div key={d.id} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{d.originalName}</p>
                <p className="text-xs text-slate-600">{d.docType}</p>
                {d.expiresAt && <p className="text-xs text-slate-500">Expiration: {new Date(d.expiresAt).toLocaleDateString("fr-FR")}</p>}
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/admin-documents/boat/${d.id}/preview-url`);
                    const payload = await res.json().catch(() => ({}));
                    if (!res.ok || !payload?.previewUrl) {
                      throw new Error(payload?.error || "Impossible d'ouvrir l'aperçu");
                    }
                    window.open(payload.previewUrl, "_blank", "noopener,noreferrer");
                  } catch (err: any) {
                    setMessage(err?.message || "Erreur ouverture aperçu");
                  }
                }}
                className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-semibold whitespace-nowrap"
              >
                Aperçu
              </button>
            </div>
          </div>
        ))}
      </div>
      {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
    </div>
  );
}

