import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Express, Request, Response } from "express";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const scrypt = promisify(_scrypt);

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

async function verifyScryptPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = (storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export function registerAdminAuthRoutes(app: Express) {
  app.post("/api/admin-auth/local-login", async (req: Request, res: Response) => {
    try {
      const configuredEmail = normalizeEmail(process.env.ADMIN_EMAIL);
      const configuredHash = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
      const configuredPlain = String(process.env.ADMIN_PASSWORD_PLAIN || "");
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || "");

      if (!configuredEmail || (!configuredHash && !configuredPlain)) {
        return res.status(500).json({
          error: "ADMIN_EMAIL + (ADMIN_PASSWORD_HASH ou ADMIN_PASSWORD_PLAIN) requis.",
        });
      }

      if (!email || !password) {
        return res.status(400).json({ error: "Email et mot de passe requis." });
      }

      if (email !== configuredEmail) {
        return res.status(401).json({ error: "Identifiants invalides." });
      }

      const ok = configuredPlain
        ? password === configuredPlain
        : await verifyScryptPassword(password, configuredHash);

      if (!ok) {
        return res.status(401).json({ error: "Identifiants invalides." });
      }

      const sessionToken = await sdk.createSessionToken("local-admin", {
        name: "Admin Local",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      const acceptsHtml = String(req.headers.accept || "").includes("text/html");
      if (acceptsHtml) {
        return res.redirect(302, "/home/admin");
      }

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Erreur login local" });
    }
  });

  app.post("/api/admin-auth/logout", async (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.json({ success: true });
  });

  app.get("/api/admin-auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin requis" });
      }
      return res.json({
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    } catch {
      return res.status(401).json({ error: "Authentification requise" });
    }
  });
}
