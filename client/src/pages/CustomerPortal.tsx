import { useEffect, useMemo, useState } from "react";
import { Check, LogOut, Mail } from "lucide-react";
import { withBasePath } from "@/lib/basePath";

type Reservation = {
  id: number;
  formule?: string;
  destination: string;
  dateDebut: string;
  dateFin: string;
  montantTotal: number;
  nbPersonnes?: number;
  workflowStatut?: string;
  acompteMontant?: number;
  soldeMontant?: number;
  soldeEcheanceAt?: string | null;
};

type CustomerDoc = {
  id: number;
  reservationId: number | null;
  docType: string;
  originalName: string;
  createdAt: string;
};

type PassengerForm = {
  firstName: string;
  lastName: string;
  docKind: "cni" | "passeport" | "permis";
};

export default function CustomerPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loginLink, setLoginLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<{ email: string } | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [docs, setDocs] = useState<CustomerDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [passengerForms, setPassengerForms] = useState<Record<number, PassengerForm>>({});

  const workflowRecap = (r: Reservation) => {
    const ws = r.workflowStatut || "demande";
    const quoteSigned = ws === "contrat_signe" || ws === "acompte_confirme" || ws === "solde_confirme";
    const acompteReceived = ws === "acompte_confirme" || ws === "solde_confirme";
    const reservationValidated = ws === "acompte_confirme" || ws === "solde_confirme";
    const soldeExpected = ws !== "solde_confirme";
    return { quoteSigned, acompteReceived, reservationValidated, soldeExpected };
  };

  const urlToken = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);

  const loadPortal = async () => {
    const meRes = await fetch("/api/customer-auth/me");
    if (!meRes.ok) {
      setMe(null);
      return;
    }
    const meData = await meRes.json();
    setMe(meData);
    const [rRes, dRes] = await Promise.all([fetch("/api/customer-portal/reservations"), fetch("/api/customer-portal/documents")]);
    setReservations(rRes.ok ? await rRes.json() : []);
    setDocs(dRes.ok ? await dRes.json() : []);
  };

  useEffect(() => {
    const verifyTokenIfPresent = async () => {
      if (!urlToken) {
        await loadPortal();
        return;
      }
      const res = await fetch("/api/customer-auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: urlToken }),
      });
      if (res.ok) {
        window.history.replaceState({}, "", withBasePath("/espace-client"));
        await loadPortal();
      } else {
        setMessage("Lien invalide ou expiré. Demandez un nouveau lien.");
      }
    };
    void verifyTokenIfPresent();
  }, [urlToken]);

  const requestLink = async () => {
    setLoading(true);
    setMessage("");
    setLoginLink("");
    try {
      const res = await fetch("/api/customer-auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, origin: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur envoi lien");
      if (data?.loginLink) {
        setLoginLink(data.loginLink);
        setMessage(data?.emailSent ? "Lien envoyé par email." : "Email indisponible. Utilisez le bouton de connexion directe.");
      } else {
        setMessage("Lien envoyé par email.");
      }
    } catch (e: any) {
      setMessage(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const loginWithPassword = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/customer-auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Connexion impossible");
      await loadPortal();
    } catch (e: any) {
      setMessage(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/customer-auth/logout", { method: "POST" });
    setMe(null);
    setReservations([]);
    setDocs([]);
  };

  const getCroisiereLabel = (r: Reservation) => {
    const formule = (r.formule || "").toLowerCase();
    const destination = (r.destination || "").toLowerCase();
    if (formule.includes("transat") || destination.includes("transat")) return "Transatlantique";
    if (formule.includes("cara") || destination.includes("cara") || destination.includes("grenad")) return "Croisière Caraïbe";
    return "Croisière Med";
  };

  const requiresPassportOnly = (r: Reservation) => {
    const label = getCroisiereLabel(r);
    return label === "Croisière Caraïbe" || label === "Transatlantique";
  };

  const uploadPassengerDocument = async (reservation: Reservation, file: File) => {
    const form = passengerForms[reservation.id];
    if (!form?.firstName?.trim() || !form?.lastName?.trim()) {
      setMessage("Veuillez renseigner le prénom et le nom du passager.");
      return;
    }
    if (requiresPassportOnly(reservation) && form.docKind !== "passeport") {
      setMessage("Passeport obligatoire pour cette réservation (Caraïbe/Transat).");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("Fichier trop volumineux (max 20MB)");
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const encodedDocType = `passager|${form.firstName.trim()}|${form.lastName.trim()}|${form.docKind}`;
      const res = await fetch("/api/customer-portal/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: reservation.id,
          docType: encodedDocType,
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64Data: base64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload impossible");
      setMessage("Document passager envoyé.");
      await loadPortal();
    } catch (e: any) {
      setMessage(e?.message || "Erreur upload");
    } finally {
      setUploading(false);
    }
  };

  const docsForReservation = (reservationId: number) =>
    docs.filter((d) => d.reservationId === reservationId && d.docType.startsWith("passager|"));

  const passengersForReservation = (reservationId: number) => {
    const unique = new Set<string>();
    docsForReservation(reservationId).forEach((d) => {
      const [, first = "", last = ""] = d.docType.split("|");
      const fullName = `${last} ${first}`.trim();
      if (fullName) unique.add(fullName);
    });
    return Array.from(unique);
  };

  if (!me) {
    return (
      <div className="relative min-h-screen text-white px-6 py-16 overflow-hidden">
        <div className="absolute inset-0 -z-20">
          <iframe
            src="https://www.youtube.com/embed/8SaiovLCOHQ?autoplay=1&mute=1&controls=0&loop=1&playlist=8SaiovLCOHQ&modestbranding=1&showinfo=0&rel=0"
            title="Sabine Sailing background"
            className="w-full h-full object-cover scale-125 pointer-events-none"
            allow="autoplay; encrypted-media"
          />
        </div>
        <div className="absolute inset-0 -z-10 bg-[oklch(0.08_0.04_220)]/75 backdrop-blur-[1px]" />
        <div className="max-w-lg mx-auto">
          <a href={withBasePath("/")} className="inline-flex items-center mb-4" aria-label="Retour à l'accueil">
            <img src="/logo-sabine.png" alt="Sabine Sailing" className="h-14 w-auto object-contain" />
          </a>
        </div>
        <div className="max-w-lg mx-auto bg-white/10 border border-white/20 shadow-2xl rounded-2xl p-6">
          <h1 className="text-2xl font-bold mb-2">Espace client</h1>
          <p className="text-white/60 text-sm mb-5">Connectez-vous avec vos identifiants reçus par email, ou demandez un lien sécurisé.</p>
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-white/15 border border-white/30 rounded-xl px-4 py-2.5 text-sm placeholder:text-white/50"
              placeholder="Votre email"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-white/15 border border-white/30 rounded-xl px-4 py-2.5 text-sm placeholder:text-white/50"
              placeholder="Mot de passe"
            />
            <button
              onClick={loginWithPassword}
              disabled={loading || !email || !password}
              className="w-full py-2.5 rounded-xl bg-white text-[oklch(0.15_0.05_220)] font-bold disabled:opacity-50"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
            <button
              onClick={requestLink}
              disabled={loading || !email}
              className="w-full py-2.5 rounded-xl bg-[oklch(0.72_0.11_85)] text-[oklch(0.15_0.05_220)] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" /> {loading ? "Envoi..." : "Recevoir un lien de secours"}
            </button>
            {message && <p className="text-xs text-white/75">{message}</p>}
            {loginLink && (
              <a
                href={loginLink}
                className="block w-full py-2.5 rounded-xl border border-white/40 bg-white/10 text-white text-center text-sm font-bold hover:bg-white/20 transition-colors"
              >
                Ouvrir mon espace client
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-white px-6 py-12 overflow-hidden">
      <div className="absolute inset-0 -z-20">
        <iframe
          src="https://www.youtube.com/embed/8SaiovLCOHQ?autoplay=1&mute=1&controls=0&loop=1&playlist=8SaiovLCOHQ&modestbranding=1&showinfo=0&rel=0"
          title="Sabine Sailing background"
          className="w-full h-full object-cover scale-125 pointer-events-none"
          allow="autoplay; encrypted-media"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-[oklch(0.08_0.04_220)]/78 backdrop-blur-[1px]" />
      <div className="max-w-5xl mx-auto">
        <a href={withBasePath("/")} className="inline-flex items-center mb-4" aria-label="Retour à l'accueil">
          <img src="/logo-sabine.png" alt="Sabine Sailing" className="h-14 w-auto object-contain" />
        </a>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Espace client</h1>
            <p className="text-white/60 text-sm">{me.email}</p>
          </div>
          <button onClick={logout} className="px-4 py-2 rounded-xl border border-white/20 text-sm flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>

        <div className="grid gap-6">
          <div className="bg-white/10 border border-white/20 rounded-2xl p-5 shadow-xl">
            <h2 className="text-lg font-bold mb-3">Mes réservations</h2>
            {reservations.length === 0 ? (
              <p className="text-white/60 text-sm">Aucune réservation liée à cet email.</p>
            ) : (
              <div className="space-y-3">
                {reservations.map(r => (
                  <div key={r.id} className="p-3 rounded-xl bg-white/10 border border-white/20">
                    <p className="font-medium">#{r.id} — {r.destination}</p>
                    <p className="text-xs text-white/80">{getCroisiereLabel(r)}</p>
                    <p className="text-xs text-white/60">
                      {new Date(r.dateDebut).toLocaleDateString("fr-FR")} {"->"} {new Date(r.dateFin).toLocaleDateString("fr-FR")}
                    </p>
                    <p className="text-xs text-white/60">{(r.montantTotal / 100).toLocaleString("fr-FR")} EUR</p>
                    <p className="text-xs text-white/70">Passagers: {r.nbPersonnes || 0}</p>
                    {r.workflowStatut && <p className="text-[10px] uppercase text-white/50 mt-1">{r.workflowStatut.replaceAll("_", " ")}</p>}
                    {(() => {
                      const passengers = passengersForReservation(r.id);
                      if (!passengers.length) return null;
                      return (
                        <div className="mt-2 rounded-lg bg-black/20 border border-white/10 p-2">
                          <p className="text-[11px] font-semibold text-white/85 mb-1">Liste passagers</p>
                          {passengers.map((p) => (
                            <p key={`${r.id}-${p}`} className="text-[11px] text-white/75 flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{p}</span>
                            </p>
                          ))}
                        </div>
                      );
                    })()}
                    {(() => {
                      const recap = workflowRecap(r);
                      return (
                        <div className="mt-2 p-2.5 rounded-lg bg-black/20 border border-white/10 text-[11px] space-y-1">
                          <p className="font-semibold text-white/90">Récapitulatif dossier</p>
                          <p className={recap.quoteSigned ? "text-emerald-300" : "text-white/70"}>
                            {recap.quoteSigned ? "✓" : "•"} Devis / contrat signé
                          </p>
                          <p className={recap.acompteReceived ? "text-emerald-300" : "text-white/70"}>
                            {recap.acompteReceived ? "✓" : "•"} Acompte reçu
                            {typeof r.acompteMontant === "number" && r.acompteMontant > 0
                              ? ` (${(r.acompteMontant / 100).toLocaleString("fr-FR")} EUR)`
                              : ""}
                          </p>
                          <p className={recap.reservationValidated ? "text-emerald-300" : "text-white/70"}>
                            {recap.reservationValidated ? "✓" : "•"} Réservation validée
                          </p>
                          <p className={recap.soldeExpected ? "text-amber-300" : "text-emerald-300"}>
                            {recap.soldeExpected ? "•" : "✓"} Solde {recap.soldeExpected ? "attendu" : "versé"}
                            {r.soldeEcheanceAt
                              ? ` (échéance ${new Date(r.soldeEcheanceAt).toLocaleDateString("fr-FR")})`
                              : " (J-45 avant départ)"}
                            {typeof r.soldeMontant === "number" && r.soldeMontant > 0
                              ? ` - ${(r.soldeMontant / 100).toLocaleString("fr-FR")} EUR`
                              : ""}
                          </p>
                        </div>
                      );
                    })()}
                    <div className="mt-3 p-2.5 rounded-lg bg-black/20 border border-white/10">
                      <p className="font-semibold text-white/90 text-[11px] mb-2">Passagers & pièces d'identité</p>
                      <p className="text-[11px] text-white/70 mb-2">
                        {requiresPassportOnly(r)
                          ? "Passeport obligatoire (Caraïbe/Transat)."
                          : "Croisière Med: CNI, passeport ou permis acceptés."}
                      </p>
                      <div className="grid sm:grid-cols-4 gap-2">
                        <input
                          value={passengerForms[r.id]?.firstName || ""}
                          onChange={(e) =>
                            setPassengerForms((prev) => ({
                              ...prev,
                              [r.id]: {
                                firstName: e.target.value,
                                lastName: prev[r.id]?.lastName || "",
                                docKind: prev[r.id]?.docKind || "cni",
                              },
                            }))
                          }
                          className="bg-white/15 border border-white/25 rounded px-2 py-1.5 text-[11px]"
                          placeholder="Prénom passager"
                        />
                        <input
                          value={passengerForms[r.id]?.lastName || ""}
                          onChange={(e) =>
                            setPassengerForms((prev) => ({
                              ...prev,
                              [r.id]: {
                                firstName: prev[r.id]?.firstName || "",
                                lastName: e.target.value,
                                docKind: prev[r.id]?.docKind || "cni",
                              },
                            }))
                          }
                          className="bg-white/15 border border-white/25 rounded px-2 py-1.5 text-[11px]"
                          placeholder="Nom passager"
                        />
                        <select
                          value={passengerForms[r.id]?.docKind || "cni"}
                          onChange={(e) =>
                            setPassengerForms((prev) => ({
                              ...prev,
                              [r.id]: {
                                firstName: prev[r.id]?.firstName || "",
                                lastName: prev[r.id]?.lastName || "",
                                docKind: e.target.value as PassengerForm["docKind"],
                              },
                            }))
                          }
                          className="bg-[oklch(0.16_0.03_230)] border border-white/25 rounded px-2 py-1.5 text-[11px] text-white"
                        >
                          {!requiresPassportOnly(r) && <option value="cni">CNI</option>}
                          <option value="passeport">Passeport</option>
                          {!requiresPassportOnly(r) && <option value="permis">Permis</option>}
                        </select>
                        <label className="cursor-pointer bg-white/10 border border-white/25 rounded px-2 py-1.5 text-[11px] text-center hover:bg-white/20 transition-colors">
                          {uploading ? "Envoi..." : "Ajouter pièce"}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadPassengerDocument(r, file);
                            }}
                          />
                        </label>
                      </div>
                      {docsForReservation(r.id).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {docsForReservation(r.id).map((d) => {
                            const [, first = "", last = "", kind = ""] = d.docType.split("|");
                            const kindLabel = kind === "cni" ? "CNI" : kind === "permis" ? "Permis" : "Passeport";
                            return (
                              <p key={d.id} className="text-[10px] text-white/70">
                                {first} {last} — {kindLabel} — {d.originalName}
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {message && <p className="text-xs text-white/75 mt-3">{message}</p>}
      </div>
    </div>
  );
}
