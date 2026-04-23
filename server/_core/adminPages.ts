import type { Express, Request, Response } from "express";
import { sdk } from "./sdk";

export function registerLocalAdminPages(app: Express) {
  // Keep stable fallback routes available, but let /home/admin and /home/admin/login
  // be handled by the React app (served through static SPA fallback).

  app.get("/home/admin/local-login", (_req: Request, res: Response) => {
    return res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Connexion admin locale</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;background:#f3f6fb;margin:0;padding:24px;color:#112a4a}
      .card{max-width:420px;margin:40px auto;background:#fff;border:1px solid #dbe4f0;border-radius:12px;padding:24px}
      h1{font-size:20px;margin:0 0 16px}
      label{display:block;font-size:14px;margin:12px 0 6px}
      input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c5d2e5;border-radius:8px}
      button{margin-top:16px;width:100%;padding:11px;border:0;border-radius:8px;background:#12355e;color:#fff;font-weight:700;cursor:pointer}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Connexion administrateur</h1>
      <form id="admin-login-form">
        <label>Email</label>
        <input type="email" name="email" required />
        <label>Mot de passe</label>
        <input type="password" name="password" required />
        <button type="submit">Se connecter</button>
      </form>
      <p id="err" style="color:#b42318;font-size:13px;margin-top:10px;min-height:18px"></p>
    </div>
    <script>
      const form = document.getElementById("admin-login-form");
      const err = document.getElementById("err");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        err.textContent = "";
        const fd = new FormData(form);
        const email = String(fd.get("email") || "");
        const password = String(fd.get("password") || "");
        try {
          const response = await fetch("/api/admin-auth/local-login", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload?.success) {
            err.textContent = payload?.error || "Identifiants invalides.";
            return;
          }
          window.location.href = "/home/admin";
        } catch {
          err.textContent = "Erreur reseau, reessayez.";
        }
      });
    </script>
  </body>
</html>`);
  });

  app.get("/home/admin/fallback", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || user.role !== "admin") {
        return res.redirect(302, "/home/admin/local-login");
      }
      return res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).send(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Back-office Sabine Sailing</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;background:#f3f6fb;margin:0;padding:20px;color:#112a4a}
      h1,h2{margin:0 0 12px}
      .bar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
      .btn{display:inline-block;padding:10px 14px;border-radius:8px;background:#12355e;color:#fff;text-decoration:none;border:0;cursor:pointer}
      .card{background:#fff;border:1px solid #dbe4f0;border-radius:12px;padding:16px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border-bottom:1px solid #edf2f7;padding:8px;text-align:left;vertical-align:top}
      th{background:#f8fbff}
      .muted{color:#5b718f}
      .mono{font-family:Consolas,Monaco,monospace}
    </style>
  </head>
  <body>
    <h1>Back-office (mode stable)</h1>
    <p class="muted">Connecte en tant que <strong>${user.name || "Admin"}</strong> (${user.openId}).</p>
    <div class="bar">
      <a class="btn" href="/home/">Retour au site</a>
      <button class="btn" onclick="refreshAll()">Rafraichir</button>
      <a class="btn" href="/api/admin-auth/logout">Deconnexion</a>
    </div>

    <div class="card">
      <h2>Reservations</h2>
      <div id="reservations" class="muted">Chargement...</div>
    </div>

    <div class="card">
      <h2>Disponibilites / Calendrier</h2>
      <div id="disponibilites" class="muted">Chargement...</div>
    </div>

    <div class="card">
      <h2>Documents bateau</h2>
      <div id="documents" class="muted">Chargement...</div>
    </div>

    <script>
      const fmtDate = (v) => {
        try { return new Date(v).toLocaleString("fr-FR"); } catch { return v || ""; }
      };

      const esc = (v) => String(v ?? "").replace(/[&<>]/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[m]));

      function renderTable(targetId, headers, rows) {
        const target = document.getElementById(targetId);
        if (!rows.length) {
          target.innerHTML = "<p class='muted'>Aucune donnee.</p>";
          return;
        }
        target.innerHTML = "<table><thead><tr>" + headers.map(h => "<th>"+h+"</th>").join("") + "</tr></thead><tbody>" +
          rows.map(r => "<tr>" + r.map(c => "<td>"+c+"</td>").join("") + "</tr>").join("") +
          "</tbody></table>";
      }

      async function loadReservations() {
        const el = document.getElementById("reservations");
        try {
          const r = await fetch("/api/reservations", { credentials: "include" });
          const data = await r.json();
          if (!r.ok) throw new Error(data?.error || "Erreur reservations");
          const rows = (Array.isArray(data) ? data : []).slice(0, 50).map(x => [
            esc(x.id),
            esc(x.nomClient),
            esc(x.emailClient),
            esc(x.destination),
            esc((x.montantTotal / 100).toFixed(2) + " EUR"),
            esc(x.workflowStatut || "demande"),
            esc(fmtDate(x.createdAt))
          ]);
          renderTable("reservations", ["ID","Client","Email","Destination","Montant","Statut","Creation"], rows);
        } catch (e) {
          el.innerHTML = "<p class='mono'>"+esc(e.message || e)+"</p>";
        }
      }

      async function loadDisponibilites() {
        const el = document.getElementById("disponibilites");
        try {
          const r = await fetch("/api/disponibilites", { credentials: "include" });
          const data = await r.json();
          if (!r.ok) throw new Error(data?.error || "Erreur disponibilites");
          const rows = (Array.isArray(data) ? data : []).slice(0, 80).map(x => [
            esc(x.id),
            esc(fmtDate(x.debut)),
            esc(fmtDate(x.fin)),
            esc(x.destination),
            esc(x.statut),
            esc(x.tarif != null ? String(x.tarif) : "-")
          ]);
          renderTable("disponibilites", ["ID","Debut","Fin","Destination","Statut","Tarif"], rows);
        } catch (e) {
          el.innerHTML = "<p class='mono'>"+esc(e.message || e)+"</p>";
        }
      }

      async function loadDocuments() {
        const el = document.getElementById("documents");
        try {
          const r = await fetch("/api/admin-documents/boat", { credentials: "include" });
          const data = await r.json();
          if (!r.ok) throw new Error(data?.error || "Erreur documents");
          const rows = (Array.isArray(data) ? data : []).slice(0, 80).map(x => [
            esc(x.id),
            esc(x.docType),
            esc(x.originalName),
            esc(fmtDate(x.createdAt || x.uploadedAt || "")),
            "<a href='/api/admin-documents/boat/"+encodeURIComponent(x.id)+"/preview-url' target='_blank'>Apercu</a>"
          ]);
          renderTable("documents", ["ID","Type","Nom","Date","Action"], rows);
        } catch (e) {
          el.innerHTML = "<p class='mono'>"+esc(e.message || e)+"</p>";
        }
      }

      async function refreshAll() {
        await Promise.all([loadReservations(), loadDisponibilites(), loadDocuments()]);
      }
      refreshAll();
    </script>
  </body>
</html>`);
    } catch {
      return res.redirect(302, "/home/admin/local-login");
    }
  });
}
