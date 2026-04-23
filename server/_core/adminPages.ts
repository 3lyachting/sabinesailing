import type { Express, Request, Response } from "express";
import { sdk } from "./sdk";

export function registerLocalAdminPages(app: Express) {
  app.get("/home/admin", (_req: Request, res: Response) => {
    return res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).send(`<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Admin Access</title></head>
  <body style="font-family:Arial,Helvetica,sans-serif;padding:24px;background:#ffffff;color:#111111">
    <h1>Acces Back-Office</h1>
    <p>Cette page est un point d'entree admin force pour eviter toute page blanche.</p>
    <p><a href="/home/admin/local-login">Ouvrir la connexion admin</a></p>
    <p><a href="/home/admin/fallback">Ouvrir le back-office fallback</a></p>
    <p><a href="/home/">Retour au site</a></p>
  </body>
</html>`);
  });

  app.get("/home/admin/login", (_req: Request, res: Response) => {
    return res.redirect(302, "/home/admin/local-login");
  });

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
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Admin</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f3f6fb;padding:24px;color:#112a4a">
<h1>Administration</h1>
<p>Connecte en tant que <strong>${user.name || "Admin"}</strong> (${user.openId}).</p>
<p>Back-office serveur actif. Si l'interface React est blanche, ce mode reste disponible.</p>
<p><a href="/home/" style="color:#12355e">Retour au site</a></p>
</body></html>`);
    } catch {
      return res.redirect(302, "/home/admin/local-login");
    }
  });
}
