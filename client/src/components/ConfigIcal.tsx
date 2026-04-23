import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link2, Save, RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Calendar } from "lucide-react";

export default function ConfigIcal() {
  const [icalUrl, setIcalUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [eventsCount, setEventsCount] = useState<number | null>(null);
  const [exportUrl, setExportUrl] = useState("");

  // Charger la config existante + nb événements
  useEffect(() => {
    Promise.all([
      fetch("/api/ical/config").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ical/events").then((r) => r.json()).catch(() => []),
      
    ])
      .then(([configData, events]) => {
        if (configData?.url) setIcalUrl(configData.url);
        if (configData?.exportUrl) setExportUrl(configData.exportUrl);
        if (Array.isArray(events)) setEventsCount(events.length);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ical/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: icalUrl }),
      });
      if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
      setMessage({ type: "success", text: "URL iCal sauvegardée ! Cliquez sur Synchroniser pour importer les événements." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      // Vider le cache puis recharger les events
      await fetch("/api/ical/refresh", { method: "POST" });
      const evRes = await fetch("/api/ical/events");
      const events = await evRes.json();
      if (!evRes.ok) throw new Error(events?.error || "Erreur lors de la synchronisation");
      const count = Array.isArray(events) ? events.length : 0;
      setMessage({
        type: "success",
        text: `Synchronisé : ${count} événement(s) importé(s) depuis Google Agenda`,
      });
      setEventsCount(count);
      setLastSync(new Date().toISOString());
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erreur" });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
        <p className="text-slate-600 mt-4">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-blue-900 flex items-center gap-3">
          <Link2 className="w-8 h-8" />
          Synchronisation Google Agenda
        </h2>
        <p className="text-slate-600 mt-1">
          Connectez votre Google Agenda pour synchroniser automatiquement les disponibilités
        </p>
      </div>

      {/* Carte instructions */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6"
      >
        <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Comment obtenir l'URL iCal de votre Google Agenda
        </h3>
        <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside">
          <li>
            Ouvrez{" "}
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline inline-flex items-center gap-1"
            >
              Google Calendar <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>Sélectionnez ou créez un agenda dédié "Sabine Sailing - Réservations"</li>
          <li>Cliquez sur les 3 points à côté de l'agenda → <strong>Paramètres et partage</strong></li>
          <li>
            Descendez jusqu'à <strong>Adresse secrète au format iCal</strong> (privée) et copiez l'URL
            qui se termine par <code className="bg-slate-200 px-1 rounded">.ics</code>
          </li>
          <li>Collez-la dans le champ ci-dessous et cliquez sur <strong>Sauvegarder</strong></li>
        </ol>
        <p className="text-xs text-amber-700 mt-3">
          ⚠️ Ne partagez jamais cette URL publiquement, elle donne accès à votre agenda
        </p>
      </motion.div>

      {/* Formulaire URL */}
      <div className="bg-white rounded-xl shadow border border-slate-200 p-6 mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          URL iCal privée
        </label>
        <input
          type="url"
          value={icalUrl}
          onChange={(e) => setIcalUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 font-mono text-sm"
        />

        <div className="flex gap-3 mt-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving || !icalUrl}
            className="flex items-center gap-2 px-6 py-3 bg-blue-900 text-white rounded-lg font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleRefresh}
            disabled={refreshing || !icalUrl}
            className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-lg font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Synchronisation..." : "Synchroniser maintenant"}
          </motion.button>
        </div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 p-3 rounded-lg flex items-start gap-2 text-sm ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </motion.div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow border border-slate-200 p-6 mb-6">
        <h3 className="font-bold text-blue-900 mb-2">Flux iCal export (planning interne)</h3>
        <p className="text-sm text-slate-600 mb-3">
          Utilisez cette URL dans vos outils externes pour lire le planning généré par le backoffice.
        </p>
        <input
          type="text"
          readOnly
          value={exportUrl}
          className="w-full px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 font-mono text-xs"
        />
      </div>

      {/* Statut de la synchro */}
      {(lastSync || eventsCount !== null) && (
        <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
          <h3 className="font-bold text-blue-900 mb-3">État de la synchronisation</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Dernière synchro</p>
              <p className="text-slate-800 font-medium">
                {lastSync ? new Date(lastSync).toLocaleString("fr-FR") : "Jamais"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Événements importés</p>
              <p className="text-slate-800 font-medium">{eventsCount ?? "—"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
