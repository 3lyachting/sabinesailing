import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Check, X, Anchor, Mail, Home } from "lucide-react";

export function ReservationSucces() {
  const [, setLocation] = useLocation();
  const [details, setDetails] = useState<any>(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (sessionId) {
      fetch(`/api/stripe/session/${sessionId}`)
        .then(r => r.json())
        .then(setDetails)
        .catch(console.error);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.04_220)] text-white flex items-center justify-center px-6">
      <div className="max-w-lg w-full text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-green-400" />
        </div>

        <h1 className="text-4xl font-bold mb-3" style={{ fontFamily: "Syne, sans-serif" }}>
          Paiement confirmé !
        </h1>
        <p className="text-white/60 mb-8">
          Merci pour votre réservation. Votre paiement a bien été reçu.
        </p>

        {details && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 text-left space-y-3">
            <div className="flex justify-between">
              <span className="text-white/60 text-sm">Email</span>
              <span className="font-medium text-sm">{details.customerEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60 text-sm">Montant payé</span>
              <span className="font-bold text-[oklch(0.82_0.1_85)]">
                {details.amountTotal ? (details.amountTotal / 100).toLocaleString("fr-FR") : 0} €
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60 text-sm">Statut</span>
              <span className="text-green-400 text-sm font-medium capitalize">{details.status}</span>
            </div>
          </div>
        )}

        <div className="bg-[oklch(0.82_0.1_85)]/10 border border-[oklch(0.82_0.1_85)]/30 rounded-2xl p-6 mb-6">
          <Mail className="w-5 h-5 text-[oklch(0.82_0.1_85)] mx-auto mb-3" />
          <p className="text-sm text-white/80">
            Un email de confirmation vous a été envoyé.<br />
            Victor ou un membre de l'équipage vous contactera sous 24h pour finaliser les détails.
          </p>
        </div>

        <button
          onClick={() => setLocation("/")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors border border-white/20"
        >
          <Home className="w-4 h-4" />
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}

export function ReservationAnnule() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.04_220)] text-white flex items-center justify-center px-6">
      <div className="max-w-lg w-full text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto mb-6">
          <X className="w-10 h-10 text-red-400" />
        </div>

        <h1 className="text-4xl font-bold mb-3" style={{ fontFamily: "Syne, sans-serif" }}>
          Paiement annulé
        </h1>
        <p className="text-white/60 mb-8">
          Votre paiement a été annulé. Aucun montant n'a été débité.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[oklch(0.72_0.11_85)] text-[oklch(0.15_0.05_220)] hover:bg-[oklch(0.62_0.11_85)] transition-colors font-bold"
          >
            <Anchor className="w-4 h-4" />
            Réessayer
          </button>
          <button
            onClick={() => setLocation("/")}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors border border-white/20"
          >
            <Home className="w-4 h-4" />
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}
