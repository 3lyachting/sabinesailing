import { Router } from "express";
import { SignJWT, jwtVerify } from "jose";
import nodemailer from "nodemailer";
import { parse as parseCookie } from "cookie";
import { createHash, randomBytes } from "node:crypto";
import { eq, and, gte } from "drizzle-orm";
import { getDb } from "../db";
import { customerMagicLinks, customers } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getSessionCookieOptions } from "../_core/cookies";
import { verifyCustomerPassword } from "../_core/customerPassword";

const router = Router();
const CUSTOMER_COOKIE = "customer_session_id";
const MAGIC_LINK_TTL_MIN = 30;

const required = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function signCustomerSession(email: string) {
  const secret = new TextEncoder().encode(ENV.cookieSecret || "dev-secret");
  return await new SignJWT({ email, type: "customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

async function sendMagicLink(email: string, token: string, reqOrigin: string) {
  const url = `${reqOrigin}/espace-client?token=${encodeURIComponent(token)}`;
  const logoUrl = `${reqOrigin}/logo-sabine.png`;
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS || "";
  const toEmail = email;
  const fromEmail = (process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true";

  if (!host || !user || !pass || !fromEmail) {
    return { sent: false, fallbackLink: url };
  }

  try {
    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: "Bienvenue a bord - Votre acces client Sabine Sailing",
      text: [
        "Bonjour,",
        "",
        "Votre compte client Sabine Sailing est pret.",
        "Cliquez sur ce lien securise (valide 30 minutes) pour acceder a votre espace client :",
        url,
        "",
        "A bientot a bord,",
        "L'equipe Sabine Sailing",
      ].join("\n"),
      html: `
        <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#10233f;">
          <table role="presentation" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4ebf5;">
            <tr>
              <td style="background:#112a4a;padding:20px 24px;">
                <img src="${logoUrl}" alt="Sabine Sailing" style="height:56px;width:auto;display:block;" />
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 24px 24px;">
                <h2 style="margin:0 0 10px 0;font-size:22px;line-height:1.2;color:#112a4a;">Bienvenue a bord</h2>
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2b3d57;">
                  Votre compte client <strong>Sabine Sailing</strong> est cree.
                </p>
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#2b3d57;">
                  Cliquez sur le bouton ci-dessous pour acceder a votre espace client.
                  Ce lien est securise et valable <strong>30 minutes</strong>.
                </p>
                <p style="margin:0 0 24px 0;">
                  <a href="${url}" style="display:inline-block;background:#12355e;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:9px;">
                    Acceder a mon espace client
                  </a>
                </p>
                <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#4a5f7e;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#4a5f7e;word-break:break-all;">
                  ${url}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fbff;border-top:1px solid #e4ebf5;font-size:12px;line-height:1.5;color:#60748f;">
                A bientot a bord,<br/>
                L'equipe Sabine Sailing
              </td>
            </tr>
          </table>
        </div>
      `,
    });
    return { sent: true, fallbackLink: url };
  } catch (error) {
    console.warn("[CustomerAuth] SMTP indisponible, lien de secours utilisé:", (error as any)?.message || error);
    return { sent: false, fallbackLink: url };
  }
}

router.post("/request-link", async (req, res) => {
  try {
    const { email, origin } = req.body as { email?: string; origin?: string };
    if (!required(email)) return res.status(400).json({ error: "Email requis" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await db.select().from(customers).where(eq(customers.email, normalizedEmail)).limit(1);
    if (!existing.length) {
      await db.insert(customers).values({ email: normalizedEmail, authMethod: "magic_link" });
    }

    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);
    await db.insert(customerMagicLinks).values({
      customerEmail: normalizedEmail,
      tokenHash: sha256(rawToken),
      expiresAt,
    });

    const requestOrigin =
      required(origin) && /^https?:\/\//i.test(origin.trim())
        ? origin.trim().replace(/\/+$/, "")
        : `${req.protocol}://${req.get("host")}`;
    const result = await sendMagicLink(normalizedEmail, rawToken, requestOrigin);
    return res.json({
      success: true,
      message: result.sent ? "Lien envoyé par email" : "Email indisponible, lien direct généré",
      // Toujours renvoyé pour que le client puisse se connecter même si l'email n'arrive pas.
      loginLink: result.fallbackLink,
      emailSent: result.sent,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur demande magic link" });
  }
});

router.post("/login-password", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!required(email) || !required(password)) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const normalizedEmail = email.trim().toLowerCase();
    const rows = await db.select().from(customers).where(eq(customers.email, normalizedEmail)).limit(1);
    const customer = rows[0];
    if (!customer?.passwordHash) {
      return res.status(401).json({ error: "Compte introuvable ou mot de passe non défini" });
    }

    const valid = await verifyCustomerPassword(password, customer.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const jwt = await signCustomerSession(normalizedEmail);
    res.cookie(CUSTOMER_COOKIE, jwt, getSessionCookieOptions(req));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur connexion mot de passe" });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { token } = req.body as { token?: string };
    if (!required(token)) return res.status(400).json({ error: "Token requis" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de données non disponible" });

    const tokenHash = sha256(token);
    const rows = await db
      .select()
      .from(customerMagicLinks)
      .where(and(eq(customerMagicLinks.tokenHash, tokenHash), gte(customerMagicLinks.expiresAt, new Date())))
      .limit(1);

    const link = rows[0];
    if (!link) return res.status(400).json({ error: "Lien invalide ou expiré" });

    await db
      .update(customerMagicLinks)
      .set({ usedAt: new Date() })
      .where(eq(customerMagicLinks.id, link.id));

    const jwt = await signCustomerSession(link.customerEmail);
    res.cookie(CUSTOMER_COOKIE, jwt, getSessionCookieOptions(req));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur vérification magic link" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const cookies = parseCookie(req.headers.cookie || "");
    const token = cookies[CUSTOMER_COOKIE];
    if (!token) return res.status(401).json({ error: "Non connecté" });
    const secret = new TextEncoder().encode(ENV.cookieSecret || "dev-secret");
    const payload = (await jwtVerify(token, secret)).payload as { email?: string; type?: string };
    if (!payload?.email || payload.type !== "customer") return res.status(401).json({ error: "Session invalide" });
    return res.json({ email: payload.email });
  } catch {
    return res.status(401).json({ error: "Session expirée" });
  }
});

router.post("/logout", async (req, res) => {
  res.clearCookie(CUSTOMER_COOKIE, getSessionCookieOptions(req));
  res.json({ success: true });
});

export default router;
