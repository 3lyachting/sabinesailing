import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import nodemailer from "nodemailer";

const scrypt = promisify(_scrypt);

export function generateCustomerPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function hashCustomerPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyCustomerPassword(password: string, storedHash: string) {
  const parts = (storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export async function sendCustomerPasswordEmail(email: string, password: string, reqOrigin: string) {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS || "";
  const fromEmail = (process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true";
  const loginUrl = `${reqOrigin}/espace-client`;
  const logoUrl = `${reqOrigin}/logo-sabine.png`;

  if (!host || !user || !pass || !fromEmail) {
    return { sent: false };
  }

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  await transporter.sendMail({
    from: fromEmail,
    to: email,
    subject: "Votre compte client Sabine Sailing - Mot de passe",
    text: [
      "Bonjour,",
      "",
      "Votre compte client est cree.",
      `Email: ${email}`,
      `Mot de passe: ${password}`,
      "",
      `Connectez-vous ici: ${loginUrl}`,
      "",
      "Conservez ce mot de passe. Vous pourrez demander un lien magique si besoin.",
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
              <h2 style="margin:0 0 10px 0;font-size:22px;line-height:1.2;color:#112a4a;">Votre espace client est pret</h2>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#2b3d57;">
                Voici vos identifiants pour vous connecter a votre espace client.
              </p>
              <div style="background:#f8fbff;border:1px solid #d7e3f4;border-radius:10px;padding:12px 14px;margin:0 0 18px 0;">
                <p style="margin:0 0 6px 0;font-size:14px;"><strong>Email:</strong> ${email}</p>
                <p style="margin:0;font-size:14px;"><strong>Mot de passe:</strong> ${password}</p>
              </div>
              <p style="margin:0 0 20px 0;">
                <a href="${loginUrl}" style="display:inline-block;background:#12355e;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:9px;">
                  Me connecter
                </a>
              </p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#60748f;">
                Conservez ce mot de passe en lieu sur. Vous pourrez aussi demander un lien de connexion.
              </p>
            </td>
          </tr>
        </table>
      </div>
    `,
  });

  return { sent: true };
}
