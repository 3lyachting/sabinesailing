import { Router } from "express";
import nodemailer from "nodemailer";
import { requireAdmin } from "../_core/authz";

const router = Router();

const required = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

router.post("/test-smtp", requireAdmin, async (_req, res) => {
  try {
    const host = (process.env.SMTP_HOST || "").trim();
    const user = (process.env.SMTP_USER || "").trim();
    const pass = process.env.SMTP_PASS || "";
    const toEmail = (process.env.CONTACT_TO_EMAIL || process.env.SMTP_USER || "").trim();
    const fromEmail = (process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER || "").trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === "true";

    if (!host || !user || !pass || !toEmail || !fromEmail) {
      return res.status(400).json({
        success: false,
        error:
          "Configuration email incomplète. Définissez SMTP_HOST, SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL et CONTACT_FROM_EMAIL.",
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.verify();

    return res.json({
      success: true,
      message: "Connexion SMTP OK.",
      smtp: { host, port, secure, user, fromEmail, toEmail },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Connexion SMTP impossible.",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nom, email, tel, message, formule } = req.body as {
      nom?: string;
      email?: string;
      tel?: string;
      message?: string;
      formule?: string;
    };

    if (!required(nom) || !required(email) || !required(message)) {
      return res.status(400).json({ error: "Nom, email et message sont requis." });
    }

    const host = (process.env.SMTP_HOST || "").trim();
    const user = (process.env.SMTP_USER || "").trim();
    const pass = process.env.SMTP_PASS || "";
    const toEmail = (process.env.CONTACT_TO_EMAIL || process.env.SMTP_USER || "").trim();
    const fromEmail = (process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER || "").trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === "true";

    if (!host || !user || !pass || !toEmail || !fromEmail) {
      return res.status(500).json({
        error:
          "Configuration email incomplète. Définissez SMTP_HOST, SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL et CONTACT_FROM_EMAIL.",
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const safeTel = required(tel) ? tel : "Non renseigné";
    const safeFormule = required(formule) ? formule : "Non précisée";

    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      replyTo: email,
      subject: `Nouvelle demande de contact — ${nom.trim()}`,
      text: [
        `Nom: ${nom.trim()}`,
        `Email: ${email.trim()}`,
        `Téléphone: ${safeTel}`,
        `Formule: ${safeFormule}`,
        "",
        "Message:",
        message.trim(),
      ].join("\n"),
      html: `
        <h2>Nouvelle demande de contact</h2>
        <p><strong>Nom:</strong> ${nom.trim()}</p>
        <p><strong>Email:</strong> ${email.trim()}</p>
        <p><strong>Téléphone:</strong> ${safeTel}</p>
        <p><strong>Formule:</strong> ${safeFormule}</p>
        <p><strong>Message:</strong><br/>${message.trim().replace(/\n/g, "<br/>")}</p>
      `,
    });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Erreur lors de l'envoi du message." });
  }
});

export default router;
