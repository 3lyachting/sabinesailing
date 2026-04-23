// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// drizzle/schema.ts
import { boolean, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
var roleEnum = pgEnum("role", ["user", "admin"]);
var disponibiliteStatutEnum = pgEnum("disponibilite_statut", ["disponible", "reserve", "option", "ferme"]);
var typeReservationEnum = pgEnum("type_reservation", ["bateau_entier", "cabine", "place"]);
var typePaiementEnum = pgEnum("type_paiement", ["acompte", "complet"]);
var statutPaiementEnum = pgEnum("statut_paiement", ["en_attente", "paye", "echec", "rembourse"]);
var planningTypeEnum = pgEnum("planning_type", ["charter", "technical_stop", "maintenance", "blocked"]);
var customerAuthMethodEnum = pgEnum("customer_auth_method", ["magic_link", "password"]);
var reservationWorkflowStatutEnum = pgEnum("reservation_workflow_statut", [
  "demande",
  "refusee",
  "validee_owner",
  "devis_emis",
  "devis_accepte",
  "contrat_envoye",
  "contrat_signe",
  "acompte_attente",
  "acompte_confirme",
  "facture_emise",
  "solde_attendu",
  "solde_confirme"
]);
var documentCategoryEnum = pgEnum("document_category", ["identity", "reservation", "boat"]);
var esignProviderEnum = pgEnum("esign_provider", ["yousign", "docusign", "other"]);
var users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var disponibilites = pgTable("disponibilites", {
  id: serial("id").primaryKey(),
  planningType: planningTypeEnum("planningType").default("charter").notNull(),
  debut: timestamp("debut").notNull(),
  fin: timestamp("fin").notNull(),
  statut: disponibiliteStatutEnum("statut").notNull(),
  tarif: integer("tarif"),
  // tarif bateau entier en euros (ou 1 place pour transat)
  tarifCabine: integer("tarifCabine"),
  // tarif par cabine double en euros (Med/Caraïbes)
  tarifJourPersonne: integer("tarifJourPersonne"),
  // tarif par jour et par personne (cabine/journee)
  tarifJourPriva: integer("tarifJourPriva"),
  // tarif par jour pour bateau entier (privatif)
  destination: varchar("destination", { length: 255 }).notNull(),
  // "Méditerranée", "Antilles", "Traversée Atlantique"
  capaciteTotale: integer("capaciteTotale").default(4).notNull(),
  // 4 cabines (Med/Caraïbes) ou 4 places (transat)
  cabinesReservees: integer("cabinesReservees").default(0).notNull(),
  // nb cabines/places déjà réservées
  note: text("note"),
  // note privée (admin interne)
  notePublique: text("notePublique"),
  // texte affiché sur le site public
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  firstName: varchar("firstName", { length: 120 }),
  lastName: varchar("lastName", { length: 120 }),
  phone: varchar("phone", { length: 50 }),
  authMethod: customerAuthMethodEnum("authMethod").default("magic_link").notNull(),
  passwordHash: text("passwordHash"),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var customerMagicLinks = pgTable("customerMagicLinks", {
  id: serial("id").primaryKey(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var avis = pgTable("avis", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  note: integer("note").notNull(),
  // 1 à 5
  titre: varchar("titre", { length: 255 }).notNull(),
  contenu: text("contenu").notNull(),
  destination: varchar("destination", { length: 255 }),
  // Méditerranée, Antilles, Traversée Atlantique
  approuve: boolean("approuve").default(false).notNull(),
  // Modération
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  // Informations client
  nomClient: varchar("nomClient", { length: 255 }).notNull(),
  emailClient: varchar("emailClient", { length: 320 }).notNull(),
  customerId: integer("customerId"),
  telClient: varchar("telClient", { length: 50 }),
  nbPersonnes: integer("nbPersonnes").notNull(),
  // Infos croisière
  disponibiliteId: integer("disponibiliteId"),
  // Lien vers la semaine réservée
  formule: varchar("formule", { length: 50 }).notNull(),
  // "semaine", "weekend", "journee", "traversee"
  typeReservation: typeReservationEnum("typeReservation").default("bateau_entier").notNull(),
  nbCabines: integer("nbCabines").default(1).notNull(),
  // nb cabines (Med/Caraïbes) ou nb places (transat)
  destination: varchar("destination", { length: 255 }).notNull(),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin").notNull(),
  montantTotal: integer("montantTotal").notNull(),
  // en centimes (€)
  typePaiement: typePaiementEnum("typePaiement").notNull(),
  montantPaye: integer("montantPaye").notNull(),
  // en centimes (€)
  // Stripe
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  statutPaiement: statutPaiementEnum("statutPaiement").default("en_attente").notNull(),
  workflowStatut: reservationWorkflowStatutEnum("workflowStatut").default("demande").notNull(),
  acomptePercent: integer("acomptePercent").default(20).notNull(),
  acompteMontant: integer("acompteMontant").default(0).notNull(),
  soldeMontant: integer("soldeMontant").default(0).notNull(),
  soldeEcheanceAt: timestamp("soldeEcheanceAt"),
  ownerValidatedAt: timestamp("ownerValidatedAt"),
  ownerValidatedBy: integer("ownerValidatedBy"),
  // Notes
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var reservationStatusHistory = pgTable("reservationStatusHistory", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  fromStatut: reservationWorkflowStatutEnum("fromStatut"),
  toStatut: reservationWorkflowStatutEnum("toStatut").notNull(),
  actorType: varchar("actorType", { length: 30 }).notNull(),
  // admin|customer|system
  actorId: integer("actorId"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  quoteNumber: varchar("quoteNumber", { length: 50 }).notNull().unique(),
  totalAmount: integer("totalAmount").notNull(),
  currency: varchar("currency", { length: 10 }).default("EUR").notNull(),
  pdfStorageKey: text("pdfStorageKey"),
  sentAt: timestamp("sentAt"),
  acceptedAt: timestamp("acceptedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  quoteId: integer("quoteId"),
  contractNumber: varchar("contractNumber", { length: 50 }).notNull().unique(),
  pdfStorageKey: text("pdfStorageKey"),
  esignProvider: esignProviderEnum("esignProvider").default("other").notNull(),
  esignEnvelopeId: varchar("esignEnvelopeId", { length: 255 }),
  sentAt: timestamp("sentAt"),
  signedAt: timestamp("signedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull().unique(),
  invoiceType: varchar("invoiceType", { length: 30 }).notNull(),
  // acompte|solde|full
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("EUR").notNull(),
  dueAt: timestamp("dueAt"),
  paidAt: timestamp("paidAt"),
  pdfStorageKey: text("pdfStorageKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var paymentConfirmations = pgTable("paymentConfirmations", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  invoiceId: integer("invoiceId"),
  paymentType: varchar("paymentType", { length: 20 }).notNull(),
  // acompte|solde
  amount: integer("amount").notNull(),
  confirmedBy: integer("confirmedBy"),
  confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
  note: text("note")
});
var esignEvents = pgTable("esignEvents", {
  id: serial("id").primaryKey(),
  contractId: integer("contractId").notNull(),
  provider: esignProviderEnum("provider").default("other").notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  payload: text("payload"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId"),
  customerId: integer("customerId"),
  category: documentCategoryEnum("category").notNull(),
  docType: varchar("docType", { length: 80 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  storageKey: text("storageKey").notNull(),
  isSensitive: boolean("isSensitive").default(true).notNull(),
  expiresAt: timestamp("expiresAt"),
  uploadedByType: varchar("uploadedByType", { length: 20 }).notNull(),
  // admin|customer|system
  uploadedById: integer("uploadedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var crewMembers = pgTable("crewMembers", {
  id: serial("id").primaryKey(),
  fullName: varchar("fullName", { length: 180 }).notNull(),
  role: varchar("role", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  certifications: text("certifications"),
  availabilityNote: text("availabilityNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var maintenanceTasks = pgTable("maintenanceTasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  system: varchar("system", { length: 120 }).notNull(),
  // ex: moteur tribord, gréement, électrique
  boatArea: varchar("boatArea", { length: 120 }),
  // ex: soute avant babord
  intervalHours: integer("intervalHours"),
  // ex: vidange toutes les 500h
  intervalDays: integer("intervalDays"),
  // ex: contrôle annuel
  lastDoneEngineHours: integer("lastDoneEngineHours"),
  currentEngineHours: integer("currentEngineHours"),
  lastDoneAt: timestamp("lastDoneAt"),
  nextDueAt: timestamp("nextDueAt"),
  sparePartsLocation: text("sparePartsLocation"),
  // emplacement des pièces de rechange
  boatPlanRef: text("boatPlanRef"),
  // référence plan/document
  procedureNote: text("procedureNote"),
  isCritical: boolean("isCritical").default(false).notNull(),
  isDone: boolean("isDone").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var cabinesReservees = pgTable("cabinesReservees", {
  id: serial("id").primaryKey(),
  disponibiliteId: integer("disponibiliteId").notNull(),
  nbReservees: integer("nbReservees").default(0).notNull(),
  nbTotal: integer("nbTotal").default(4).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var config = pgTable("config", {
  id: serial("id").primaryKey(),
  cle: varchar("cle", { length: 100 }).notNull().unique(),
  valeur: text("valeur"),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  eSignProvider: process.env.ESIGN_PROVIDER ?? "other",
  eSignYousignApiKey: process.env.ESIGN_YOUSIGN_API_KEY ?? "",
  eSignYousignBaseUrl: process.env.ESIGN_YOUSIGN_BASE_URL ?? "",
  eSignDocusignAccountId: process.env.ESIGN_DOCUSIGN_ACCOUNT_ID ?? "",
  eSignDocusignAccessToken: process.env.ESIGN_DOCUSIGN_ACCESS_TOKEN ?? "",
  eSignDocusignBasePath: process.env.ESIGN_DOCUSIGN_BASE_PATH ?? ""
};

// server/db.ts
var _db = null;
var _pool = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    // In local HTTP dev, SameSite=None cookies are rejected unless Secure=true.
    // Use Lax when not secure so the browser actually stores the session cookie.
    sameSite: secure ? "none" : "lax",
    secure
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    if (ENV.oAuthServerUrl) {
      console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "local-app",
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId: isNonEmptyString(appId) ? appId : "local-app",
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    if (sessionUserId === "local-admin") {
      return {
        id: 0,
        openId: "local-admin",
        name: "Admin Local",
        email: process.env.ADMIN_EMAIL ?? null,
        loginMethod: "local-admin",
        role: "admin",
        createdAt: signedInAt,
        updatedAt: signedInAt,
        lastSignedIn: signedInAt
      };
    }
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      if (!ENV.oAuthServerUrl) {
        throw ForbiddenError("OAuth unavailable and user not found");
      }
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
function registerLocalAdminPages(app) {
  app.get("/home/admin", (_req, res) => {
    return res.redirect(302, "/home/admin/fallback");
  });
  app.get("/home/admin/login", (_req, res) => {
    return res.redirect(302, "/home/admin/local-login");
  });
  app.get("/home/admin/local-login", (_req, res) => {
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
  app.get("/home/admin/fallback", async (req, res) => {
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

// server/_core/adminAuth.ts
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
var scrypt = promisify(_scrypt);
function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
async function verifyScryptPassword(password, storedHash) {
  const parts = (storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}
function registerAdminAuthRoutes(app) {
  app.post("/api/admin-auth/local-login", async (req, res) => {
    try {
      const configuredEmail = normalizeEmail(process.env.ADMIN_EMAIL);
      const configuredHash = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
      const configuredPlain = String(process.env.ADMIN_PASSWORD_PLAIN || "");
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || "");
      if (!configuredEmail || !configuredHash && !configuredPlain) {
        return res.status(500).json({
          error: "ADMIN_EMAIL + (ADMIN_PASSWORD_HASH ou ADMIN_PASSWORD_PLAIN) requis."
        });
      }
      if (!email || !password) {
        return res.status(400).json({ error: "Email et mot de passe requis." });
      }
      if (email !== configuredEmail) {
        return res.status(401).json({ error: "Identifiants invalides." });
      }
      const ok = configuredPlain ? password === configuredPlain : await verifyScryptPassword(password, configuredHash);
      if (!ok) {
        return res.status(401).json({ error: "Identifiants invalides." });
      }
      const sessionToken = await sdk.createSessionToken("local-admin", {
        name: "Admin Local",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      const acceptsHtml = String(req.headers.accept || "").includes("text/html");
      if (acceptsHtml) {
        return res.redirect(302, "/home/admin");
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error?.message || "Erreur login local" });
    }
  });
  app.post("/api/admin-auth/logout", async (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return res.json({ success: true });
  });
  app.get("/api/admin-auth/me", async (req, res) => {
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
        role: user.role
      });
    } catch {
      return res.status(401).json({ error: "Authentification requise" });
    }
  });
}

// server/_core/storageProxy.ts
import path from "node:path";
import { access } from "node:fs/promises";
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const wildcardParams = req.params;
    const key = wildcardParams["0"];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      const localPath = path.resolve(process.cwd(), ".local-storage", key);
      try {
        await access(localPath);
        res.sendFile(localPath);
        return;
      } catch {
        res.status(404).send("Local storage file not found");
        return;
      }
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// server/routes/disponibilites.ts
import { Router } from "express";
import { eq as eq2, and, gte, inArray, lte } from "drizzle-orm";

// server/_core/authz.ts
async function requireAdmin(req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin requis" });
    }
    req.authUser = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Authentification requise" });
  }
}

// server/routes/disponibilites.ts
var router2 = Router();
async function syncDisponibilitesFromReservations(db) {
  const allDispos = await db.select().from(disponibilites);
  const allReservations = await db.select().from(reservations);
  const findBestDisponibiliteForReservation = (r) => {
    const rStart = new Date(r.dateDebut).toISOString().slice(0, 10);
    const rEnd = new Date(r.dateFin).toISOString().slice(0, 10);
    const exact = allDispos.find((d) => {
      const dStart = new Date(d.debut).toISOString().slice(0, 10);
      const dEnd = new Date(d.fin).toISOString().slice(0, 10);
      return dStart === rStart && dEnd === rEnd;
    });
    if (exact) return exact;
    const rStartMs = new Date(r.dateDebut).getTime();
    const rEndMs = new Date(r.dateFin).getTime();
    return allDispos.find((d) => {
      const dStartMs = new Date(d.debut).getTime();
      const dEndMs = new Date(d.fin).getTime();
      return rStartMs < dEndMs && rEndMs > dStartMs;
    });
  };
  for (const r of allReservations) {
    const best = findBestDisponibiliteForReservation(r);
    if (best?.id && r.disponibiliteId !== best.id) {
      await db.update(reservations).set({
        disponibiliteId: best.id,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq2(reservations.id, r.id));
      r.disponibiliteId = best.id;
    }
  }
  for (const dispo of allDispos) {
    if (dispo.planningType && dispo.planningType !== "charter") {
      if (dispo.statut !== "ferme" || (dispo.cabinesReservees || 0) !== 0) {
        await db.update(disponibilites).set({
          statut: "ferme",
          cabinesReservees: 0,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(disponibilites.id, dispo.id));
      }
      continue;
    }
    const bookedReservations = await db.select().from(reservations).where(
      and(
        eq2(reservations.disponibiliteId, dispo.id),
        inArray(reservations.workflowStatut, ["contrat_signe", "acompte_confirme", "solde_confirme"])
      )
    );
    const hasPrivate = bookedReservations.some((r) => r.typeReservation === "bateau_entier");
    const reservedCabins = hasPrivate ? dispo.capaciteTotale : bookedReservations.filter((r) => r.typeReservation === "cabine" || r.typeReservation === "place").reduce((sum, r) => sum + Math.max(1, r.nbCabines || 1), 0);
    const clampedReservedCabins = Math.max(0, Math.min(dispo.capaciteTotale || 4, reservedCabins));
    let statut = "disponible";
    if (hasPrivate || clampedReservedCabins >= (dispo.capaciteTotale || 4)) statut = "reserve";
    else if (clampedReservedCabins > 0) statut = "option";
    if (dispo.statut !== statut || (dispo.cabinesReservees || 0) !== clampedReservedCabins) {
      await db.update(disponibilites).set({
        statut,
        cabinesReservees: clampedReservedCabins,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq2(disponibilites.id, dispo.id));
    }
  }
}
router2.get("/", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    await syncDisponibilitesFromReservations(db);
    const all = await db.select().from(disponibilites).orderBy(disponibilites.debut);
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la r\xE9cup\xE9ration des disponibilit\xE9s" });
  }
});
router2.get("/range", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    await syncDisponibilitesFromReservations(db);
    const { debut, fin } = req.query;
    if (!debut || !fin) {
      return res.status(400).json({ error: "Param\xE8tres debut et fin requis" });
    }
    const debutDate = new Date(debut);
    const finDate = new Date(fin);
    const result = await db.select().from(disponibilites).where(
      and(
        gte(disponibilites.debut, debutDate),
        lte(disponibilites.fin, finDate)
      )
    ).orderBy(disponibilites.debut);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la r\xE9cup\xE9ration des disponibilit\xE9s" });
  }
});
router2.post("/", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const {
      planningType,
      debut,
      fin,
      statut,
      tarif,
      tarifCabine,
      tarifJourPersonne,
      tarifJourPriva,
      destination,
      note,
      notePublique
    } = req.body;
    if (!debut || !fin || !statut || !destination) {
      return res.status(400).json({ error: "Champs requis manquants" });
    }
    const result = await db.insert(disponibilites).values({
      planningType: planningType || "charter",
      debut: new Date(debut),
      fin: new Date(fin),
      statut,
      tarif: tarif ? parseInt(tarif) : null,
      tarifCabine: tarifCabine ? parseInt(tarifCabine) : null,
      tarifJourPersonne: tarifJourPersonne ? parseInt(tarifJourPersonne) : null,
      tarifJourPriva: tarifJourPriva ? parseInt(tarifJourPriva) : null,
      destination,
      note: note || null,
      notePublique: notePublique || null
    });
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la cr\xE9ation de la disponibilit\xE9" });
  }
});
router2.put("/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const { id } = req.params;
    const {
      planningType,
      debut,
      fin,
      statut,
      tarif,
      tarifCabine,
      tarifJourPersonne,
      tarifJourPriva,
      destination,
      note,
      notePublique
    } = req.body;
    await db.update(disponibilites).set({
      planningType: planningType || void 0,
      debut: debut ? new Date(debut) : void 0,
      fin: fin ? new Date(fin) : void 0,
      statut: statut || void 0,
      tarif: tarif ? parseInt(tarif) : void 0,
      tarifCabine: tarifCabine ? parseInt(tarifCabine) : void 0,
      tarifJourPersonne: tarifJourPersonne ? parseInt(tarifJourPersonne) : void 0,
      tarifJourPriva: tarifJourPriva ? parseInt(tarifJourPriva) : void 0,
      destination: destination || void 0,
      note: note || void 0,
      notePublique: notePublique || void 0,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq2(disponibilites.id, parseInt(id)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la mise \xE0 jour de la disponibilit\xE9" });
  }
});
router2.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const { id } = req.params;
    await db.delete(disponibilites).where(eq2(disponibilites.id, parseInt(id)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la suppression de la disponibilit\xE9" });
  }
});
var disponibilites_default = router2;

// server/routes/avis.ts
import { Router as Router2 } from "express";
import { eq as eq3 } from "drizzle-orm";
var router3 = Router2();
router3.get("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const all = await db.select().from(avis).where(eq3(avis.approuve, true)).orderBy(avis.createdAt);
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la r\xE9cup\xE9ration des avis" });
  }
});
router3.get("/admin/all", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const all = await db.select().from(avis).orderBy(avis.createdAt);
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la r\xE9cup\xE9ration des avis" });
  }
});
router3.post("/", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const { nom, email, note, titre, contenu, destination } = req.body;
    if (!nom || !email || !note || !titre || !contenu) {
      return res.status(400).json({ error: "Champs requis manquants" });
    }
    if (note < 1 || note > 5) {
      return res.status(400).json({ error: "La note doit \xEAtre entre 1 et 5" });
    }
    const result = await db.insert(avis).values({
      nom,
      email,
      note: parseInt(note),
      titre,
      contenu,
      destination: destination || null,
      approuve: false
      // Modération par défaut
    });
    res.status(201).json({ success: true, message: "Avis envoy\xE9 avec succ\xE8s. Il sera publi\xE9 apr\xE8s mod\xE9ration." });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la cr\xE9ation de l'avis" });
  }
});
router3.put("/:id", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const { id } = req.params;
    const { approuve } = req.body;
    await db.update(avis).set({
      approuve: approuve === true,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq3(avis.id, parseInt(id)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la mise \xE0 jour de l'avis" });
  }
});
router3.delete("/:id", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const { id } = req.params;
    await db.delete(avis).where(eq3(avis.id, parseInt(id)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur lors de la suppression de l'avis" });
  }
});
var avis_default = router3;

// server/routes/reservations.ts
import { Router as Router3 } from "express";
import { and as and2, eq as eq4, inArray as inArray2 } from "drizzle-orm";
import { SignJWT as SignJWT2 } from "jose";

// server/_core/customerPassword.ts
import { randomBytes as randomBytes2, scrypt as _scrypt2, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import { promisify as promisify2 } from "node:util";
import nodemailer from "nodemailer";
var scrypt2 = promisify2(_scrypt2);
function generateCustomerPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes2(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
async function hashCustomerPassword(password) {
  const salt = randomBytes2(16).toString("hex");
  const derived = await scrypt2(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}
async function verifyCustomerPassword(password, storedHash) {
  const parts = (storedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const derived = await scrypt2(password, salt, 64);
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual2(expected, derived);
}
async function sendCustomerPasswordEmail(email, password, reqOrigin) {
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
      "L'equipe Sabine Sailing"
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
    `
  });
  return { sent: true };
}

// server/routes/reservations.ts
var router4 = Router3();
var CUSTOMER_COOKIE = "customer_session_id";
async function resolveDisponibiliteIdForReservation(db, r) {
  if (r.disponibiliteId) return r.disponibiliteId;
  const rows = await db.select().from(disponibilites);
  const reservationStart = new Date(r.dateDebut).toISOString().slice(0, 10);
  const reservationEnd = new Date(r.dateFin).toISOString().slice(0, 10);
  let match = rows.find((d) => {
    const dStart = new Date(d.debut).toISOString().slice(0, 10);
    const dEnd = new Date(d.fin).toISOString().slice(0, 10);
    return dStart === reservationStart && dEnd === reservationEnd;
  });
  if (!match) {
    const rStartMs = new Date(r.dateDebut).getTime();
    const rEndMs = new Date(r.dateFin).getTime();
    match = rows.find((d) => {
      const dStartMs = new Date(d.debut).getTime();
      const dEndMs = new Date(d.fin).getTime();
      return rStartMs < dEndMs && rEndMs > dStartMs;
    });
  }
  return match?.id || null;
}
async function refreshDisponibiliteBookingState(db, disponibiliteId) {
  const dispoRows = await db.select().from(disponibilites).where(eq4(disponibilites.id, disponibiliteId)).limit(1);
  const dispo = dispoRows[0];
  if (!dispo) return;
  if (dispo.planningType && dispo.planningType !== "charter") {
    await db.update(disponibilites).set({
      statut: "ferme",
      cabinesReservees: 0,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq4(disponibilites.id, disponibiliteId));
    return;
  }
  const bookedReservations = await db.select().from(reservations).where(
    and2(
      eq4(reservations.disponibiliteId, disponibiliteId),
      inArray2(reservations.workflowStatut, ["contrat_signe", "acompte_confirme", "solde_confirme"])
    )
  );
  const hasPrivate = bookedReservations.some((resv) => resv.typeReservation === "bateau_entier");
  const reservedCabins = hasPrivate ? dispo.capaciteTotale : bookedReservations.filter((resv) => resv.typeReservation === "cabine" || resv.typeReservation === "place").reduce((sum, resv) => sum + Math.max(1, resv.nbCabines || 1), 0);
  const clampedReservedCabins = Math.max(0, Math.min(dispo.capaciteTotale || 4, reservedCabins));
  let statut = "disponible";
  if (hasPrivate || clampedReservedCabins >= (dispo.capaciteTotale || 4)) statut = "reserve";
  else if (clampedReservedCabins > 0) statut = "option";
  await db.update(disponibilites).set({
    statut,
    cabinesReservees: clampedReservedCabins,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq4(disponibilites.id, disponibiliteId));
}
async function signCustomerSession(email) {
  const secret = new TextEncoder().encode(ENV.cookieSecret || "dev-secret");
  return await new SignJWT2({ email, type: "customer" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret);
}
router4.post("/request", async (req, res) => {
  try {
    const {
      nomClient,
      emailClient,
      telClient,
      nbPersonnes,
      formule,
      destination,
      dateDebut,
      dateFin,
      montantTotal,
      // en centimes
      typeReservation,
      // "bateau_entier" | "cabine" | "place"
      nbCabines,
      // nombre de cabines ou places réservées
      message,
      disponibiliteId
    } = req.body;
    if (!nomClient || !emailClient || !montantTotal || !formule || !destination) {
      return res.status(400).json({ error: "Donn\xE9es manquantes" });
    }
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const normalizedEmail = String(emailClient).trim().toLowerCase();
    const parsedNbPersonnes = Math.max(1, parseInt(nbPersonnes) || 1);
    if (parsedNbPersonnes > 8) {
      return res.status(400).json({ error: "Maximum 8 personnes par semaine." });
    }
    const normalizedTypeReservation = typeReservation === "cabine" || typeReservation === "place" ? typeReservation : "bateau_entier";
    const computedNbCabines = normalizedTypeReservation === "cabine" ? Math.max(1, Math.ceil(parsedNbPersonnes / 2)) : Math.max(1, parseInt(nbCabines) || 1);
    const customerRows = await db.select().from(customers).where(eq4(customers.email, normalizedEmail)).limit(1);
    let customerId = customerRows[0]?.id;
    let createdPassword = null;
    if (!customerId) {
      createdPassword = generateCustomerPassword(12);
      const passwordHash = await hashCustomerPassword(createdPassword);
      const insertedCustomer = await db.insert(customers).values({
        email: normalizedEmail,
        firstName: String(nomClient).split(" ")[0] || null,
        lastName: String(nomClient).split(" ").slice(1).join(" ") || null,
        phone: telClient || null,
        authMethod: "password",
        passwordHash
      }).returning({ id: customers.id });
      customerId = insertedCustomer[0]?.id;
    } else if (!customerRows[0]?.passwordHash) {
      createdPassword = generateCustomerPassword(12);
      const passwordHash = await hashCustomerPassword(createdPassword);
      await db.update(customers).set({
        passwordHash,
        authMethod: "password",
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq4(customers.id, customerRows[0].id));
    }
    if (createdPassword) {
      try {
        const origin = `${req.protocol}://${req.get("host")}`;
        await sendCustomerPasswordEmail(normalizedEmail, createdPassword, origin);
      } catch (mailError) {
        console.warn("[Reservations] Email mot de passe non envoy\xE9:", mailError?.message || mailError);
      }
    }
    const parsedDisponibiliteIdRaw = disponibiliteId !== null && disponibiliteId !== void 0 ? parseInt(disponibiliteId, 10) : null;
    const parsedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, {
      disponibiliteId: parsedDisponibiliteIdRaw,
      dateDebut,
      dateFin
    });
    if (normalizedTypeReservation === "cabine" && parsedDisponibiliteId) {
      const existingCab = await db.select().from(cabinesReservees).where(eq4(cabinesReservees.disponibiliteId, parsedDisponibiliteId)).limit(1);
      if (existingCab.length > 0) {
        const nextReserved = (existingCab[0].nbReservees || 0) + computedNbCabines;
        const totalCab = existingCab[0].nbTotal || 4;
        if (nextReserved > totalCab) {
          return res.status(400).json({ error: `Il ne reste pas assez de cabines disponibles (${totalCab - (existingCab[0].nbReservees || 0)} restantes).` });
        }
      }
    }
    const inserted = await db.insert(reservations).values({
      nomClient,
      emailClient,
      customerId: customerId || null,
      telClient: telClient || null,
      nbPersonnes: parsedNbPersonnes,
      formule,
      destination,
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
      montantTotal,
      typePaiement: "acompte",
      // Par défaut acompte
      montantPaye: 0,
      // Sera défini lors du devis
      typeReservation: normalizedTypeReservation,
      nbCabines: computedNbCabines,
      message: message || null,
      disponibiliteId: parsedDisponibiliteId || null,
      statutPaiement: "en_attente"
      // En attente de devis
    }).returning({ id: reservations.id });
    const reservationId = inserted[0]?.id;
    if (normalizedTypeReservation === "cabine" && parsedDisponibiliteId) {
      const existingCab = await db.select().from(cabinesReservees).where(eq4(cabinesReservees.disponibiliteId, parsedDisponibiliteId)).limit(1);
      if (existingCab.length > 0) {
        await db.update(cabinesReservees).set({
          nbReservees: (existingCab[0].nbReservees || 0) + computedNbCabines,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq4(cabinesReservees.disponibiliteId, parsedDisponibiliteId));
      } else {
        const dispo = await db.select().from(disponibilites).where(eq4(disponibilites.id, parsedDisponibiliteId)).limit(1);
        await db.insert(cabinesReservees).values({
          disponibiliteId: parsedDisponibiliteId,
          nbReservees: computedNbCabines,
          nbTotal: dispo[0]?.capaciteTotale || 4,
          notes: null
        });
      }
    }
    const typeResLabels = {
      bateau_entier: "Bateau entier",
      cabine: `${computedNbCabines} cabine(s) double(s)`,
      place: `${computedNbCabines} place(s)`
    };
    const typeResLabel = typeResLabels[normalizedTypeReservation] || "Bateau entier";
    const formuleLabels = {
      journee: "Journ\xE9e catamaran",
      weekend: "Week-end catamaran",
      semaine: "Semaine catamaran",
      traversee: "Travers\xE9e Atlantique"
    };
    try {
      await notifyOwner({
        title: `Nouvelle demande de r\xE9servation \u2014 ${nomClient}`,
        content: `
Nouvelle demande re\xE7ue :

**Client:** ${nomClient}
**Email:** ${emailClient}
**T\xE9l\xE9phone:** ${telClient || "Non fourni"}
**Nombre de personnes:** ${nbPersonnes}

**Croisi\xE8re:**
- Destination: ${destination}
- Formule: ${formuleLabels[formule] || formule}
- Type: ${typeResLabel}
- Dates: ${new Date(dateDebut).toLocaleDateString("fr-FR")} \u2192 ${new Date(dateFin).toLocaleDateString("fr-FR")}
- Montant estim\xE9: ${(montantTotal / 100).toLocaleString("fr-FR")} \u20AC

**Message:** ${message || "Aucun message"}

Acc\xE9dez \xE0 l'admin pour consulter et envoyer un devis.
        `
      });
    } catch (notifyError) {
      console.warn("[Reservations] Notification non envoy\xE9e:", notifyError?.message || notifyError);
    }
    const jwt = await signCustomerSession(normalizedEmail);
    res.cookie(CUSTOMER_COOKIE, jwt, getSessionCookieOptions(req));
    res.json({
      success: true,
      reservationId,
      message: "Demande de r\xE9servation envoy\xE9e avec succ\xE8s"
    });
  } catch (error) {
    console.error("[Reservations] Erreur lors de la cr\xE9ation de la demande:", error);
    res.status(500).json({ error: error.message || "Erreur lors de l'envoi de la demande" });
  }
});
router4.get("/", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const all = await db.select().from(reservations).orderBy(reservations.createdAt);
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router4.get("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const reservation = await db.select().from(reservations).where(
      eq4(reservations.id, parseInt(id))
    );
    if (!reservation.length) {
      return res.status(404).json({ error: "R\xE9servation non trouv\xE9e" });
    }
    res.json(reservation[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router4.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nomClient,
      emailClient,
      telClient,
      nbPersonnes,
      formule,
      destination,
      dateDebut,
      dateFin,
      montantTotal,
      typeReservation,
      nbCabines,
      message,
      disponibiliteId,
      statutPaiement,
      workflowStatut
    } = req.body;
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const existing = await db.select().from(reservations).where(
      eq4(reservations.id, parseInt(id))
    );
    if (!existing.length) {
      return res.status(404).json({ error: "R\xE9servation non trouv\xE9e" });
    }
    const parsedNbPersonnes = nbPersonnes !== void 0 ? Math.max(1, parseInt(nbPersonnes)) : existing[0].nbPersonnes;
    if (parsedNbPersonnes > 8) {
      return res.status(400).json({ error: "Maximum 8 personnes par semaine." });
    }
    const resolvedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, {
      disponibiliteId: disponibiliteId !== void 0 ? disponibiliteId !== null ? parseInt(disponibiliteId) : null : existing[0].disponibiliteId,
      dateDebut: dateDebut ? String(dateDebut) : new Date(existing[0].dateDebut).toISOString(),
      dateFin: dateFin ? String(dateFin) : new Date(existing[0].dateFin).toISOString()
    });
    await db.update(reservations).set({
      nomClient: nomClient || existing[0].nomClient,
      emailClient: emailClient || existing[0].emailClient,
      telClient: telClient !== void 0 ? telClient : existing[0].telClient,
      nbPersonnes: parsedNbPersonnes,
      formule: formule || existing[0].formule,
      destination: destination || existing[0].destination,
      dateDebut: dateDebut ? new Date(dateDebut) : existing[0].dateDebut,
      dateFin: dateFin ? new Date(dateFin) : existing[0].dateFin,
      montantTotal: montantTotal !== void 0 ? montantTotal : existing[0].montantTotal,
      typeReservation: typeReservation || existing[0].typeReservation,
      nbCabines: nbCabines !== void 0 ? parseInt(nbCabines) : existing[0].nbCabines,
      message: message !== void 0 ? message : existing[0].message,
      disponibiliteId: resolvedDisponibiliteId,
      statutPaiement: statutPaiement || existing[0].statutPaiement,
      workflowStatut: workflowStatut || existing[0].workflowStatut,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq4(reservations.id, parseInt(id)));
    res.json({ success: true, message: "R\xE9servation mise \xE0 jour" });
  } catch (error) {
    console.error("[Reservations] Erreur lors de la mise \xE0 jour:", error);
    res.status(500).json({ error: error.message || "Erreur lors de la mise \xE0 jour" });
  }
});
router4.post("/send-confirmation", requireAdmin, async (req, res) => {
  try {
    const { reservationId } = req.body;
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const reservation = await db.select().from(reservations).where(
      eq4(reservations.id, parseInt(reservationId))
    );
    if (!reservation.length) {
      return res.status(404).json({ error: "R\xE9servation non trouv\xE9e" });
    }
    const r = reservation[0];
    try {
      await notifyOwner({
        title: `Confirmation envoy\xE9e \xE0 ${r.nomClient}`,
        content: `
Confirmation de r\xE9servation envoy\xE9e au client :

**Client:** ${r.nomClient}
**Email:** ${r.emailClient}
**Montant:** ${(r.montantTotal / 100).toLocaleString("fr-FR")} \u20AC
**Dates:** ${new Date(r.dateDebut).toLocaleDateString("fr-FR")} \u2192 ${new Date(r.dateFin).toLocaleDateString("fr-FR")}
        `
      });
      res.json({ success: true, message: "Confirmation envoy\xE9e au client" });
    } catch (notifyError) {
      console.warn("[Reservations] Notification non envoy\xE9e:", notifyError?.message || notifyError);
      res.json({
        success: true,
        message: "Validation effectu\xE9e (notification non configur\xE9e).",
        warning: notifyError?.message || "Service notification indisponible"
      });
    }
  } catch (error) {
    console.error("[Reservations] Erreur lors de l'envoi de confirmation:", error);
    res.status(500).json({ error: error.message || "Erreur lors de l'envoi" });
  }
});
router4.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const existing = await db.select().from(reservations).where(
      eq4(reservations.id, parseInt(id))
    );
    if (!existing.length) {
      return res.status(404).json({ error: "R\xE9servation non trouv\xE9e" });
    }
    const reservationToDelete = existing[0];
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation(db, reservationToDelete);
    await db.delete(reservations).where(eq4(reservations.id, parseInt(id)));
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState(db, linkedDisponibiliteId);
    }
    res.json({ success: true, message: "R\xE9servation supprim\xE9e" });
  } catch (error) {
    console.error("[Reservations] Erreur lors de la suppression:", error);
    res.status(500).json({ error: error.message || "Erreur lors de la suppression" });
  }
});
var reservations_default = router4;

// server/routes/cabines.ts
import { Router as Router4 } from "express";
import { eq as eq5 } from "drizzle-orm";
var router5 = Router4();
router5.get("/", requireAdmin, async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const result = await db.select().from(cabinesReservees);
    res.json(result);
  } catch (err) {
    console.error("[Cabines] Erreur:", err?.message || err);
    res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});
router5.get("/:disponibiliteId", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const disponibiliteId = parseInt(req.params.disponibiliteId);
    const result = await db.select().from(cabinesReservees).where(eq5(cabinesReservees.disponibiliteId, disponibiliteId)).limit(1);
    res.json(result[0] || null);
  } catch (err) {
    console.error("[Cabines] Erreur:", err?.message || err);
    res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});
router5.post("/", requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { disponibiliteId, nbReservees, nbTotal, notes } = req.body;
    if (!disponibiliteId || nbReservees === void 0 || nbTotal === void 0) {
      return res.status(400).json({ error: "Param\xE8tres manquants" });
    }
    const existing = await db.select().from(cabinesReservees).where(eq5(cabinesReservees.disponibiliteId, disponibiliteId)).limit(1);
    if (existing.length > 0) {
      await db.update(cabinesReservees).set({
        nbReservees,
        nbTotal,
        notes: notes || null,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq5(cabinesReservees.disponibiliteId, disponibiliteId));
    } else {
      await db.insert(cabinesReservees).values({
        disponibiliteId,
        nbReservees,
        nbTotal,
        notes: notes || null
      });
    }
    res.json({ ok: true, message: "Cabines r\xE9serv\xE9es mises \xE0 jour" });
  } catch (err) {
    console.error("[Cabines] Erreur:", err?.message || err);
    res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});
var cabines_default = router5;

// server/routes/stripe.ts
import { Router as Router5 } from "express";
import Stripe from "stripe";
import { eq as eq6 } from "drizzle-orm";
var router6 = Router5();
var stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-11-20.acacia"
});
router6.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      nomClient,
      emailClient,
      telClient,
      nbPersonnes,
      formule,
      destination,
      dateDebut,
      dateFin,
      montantTotal,
      // en centimes
      typePaiement,
      // "acompte" ou "complet"
      typeReservation,
      // "bateau_entier" | "cabine" | "place"
      nbCabines,
      // nombre de cabines ou places réservées
      message,
      disponibiliteId
    } = req.body;
    if (!nomClient || !emailClient || !montantTotal || !formule || !destination) {
      return res.status(400).json({ error: "Donn\xE9es manquantes" });
    }
    const montantPaye = typePaiement === "acompte" ? Math.round(montantTotal * 0.3) : montantTotal;
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const inserted = await db.insert(reservations).values({
      nomClient,
      emailClient,
      telClient: telClient || null,
      nbPersonnes: parseInt(nbPersonnes) || 1,
      formule,
      destination,
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
      montantTotal,
      typePaiement,
      montantPaye,
      typeReservation: typeReservation || "bateau_entier",
      nbCabines: parseInt(nbCabines) || 1,
      message: message || null,
      disponibiliteId: disponibiliteId || null,
      statutPaiement: "en_attente"
    }).returning({ id: reservations.id });
    const reservationId = inserted[0]?.id;
    const formuleLabels = {
      journee: "Journ\xE9e catamaran",
      weekend: "Week-end catamaran",
      semaine: "Semaine catamaran",
      traversee: "Travers\xE9e Atlantique"
    };
    const typeResLabels = {
      bateau_entier: "Bateau entier",
      cabine: `${nbCabines} cabine(s) double(s)`,
      place: `${nbCabines} place(s)`
    };
    const typeResLabel = typeResLabels[typeReservation] || "Bateau entier";
    const productName = `${formuleLabels[formule] || formule} \u2014 ${destination}`;
    const paiementLabel = typePaiement === "acompte" ? "Acompte 30%" : "Paiement complet";
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: productName,
              description: `Sabine Sailing \xB7 Lagoon 570 \xB7 ${typeResLabel} \xB7 ${nbPersonnes} personne(s) \xB7 ${paiementLabel}`
            },
            unit_amount: montantPaye
          },
          quantity: 1
        }
      ],
      customer_email: emailClient,
      client_reference_id: reservationId?.toString(),
      payment_intent_data: {
        receipt_email: emailClient,
        description: `${productName} \u2014 ${paiementLabel}`
      },
      metadata: {
        reservation_id: reservationId?.toString() || "",
        nom_client: nomClient,
        email_client: emailClient,
        formule,
        destination,
        type_paiement: typePaiement,
        type_reservation: typeReservation || "bateau_entier",
        nb_cabines: (nbCabines || 1).toString(),
        montant_total: montantTotal.toString()
      },
      allow_promotion_codes: true,
      success_url: `${origin}/reservation/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/reservation/annule`
    });
    if (reservationId) {
      await db.update(reservations).set({ stripeSessionId: session.id }).where(eq6(reservations.id, reservationId));
    }
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("[Stripe] Erreur lors de la cr\xE9ation de la session:", error);
    res.status(500).json({ error: error.message || "Erreur lors de la cr\xE9ation du paiement" });
  }
});
router6.get("/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({
      customerEmail: session.customer_email,
      amountTotal: session.amount_total,
      status: session.payment_status,
      metadata: session.metadata
    });
  } catch (error) {
    console.error("[Stripe] Erreur lors de la r\xE9cup\xE9ration de la session:", error);
    res.status(500).json({ error: error.message });
  }
});
router6.get("/reservations", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    }
    const all = await db.select().from(reservations).orderBy(reservations.createdAt);
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
var stripe_default = router6;

// server/routes/stripeWebhook.ts
import { Router as Router6 } from "express";
import Stripe2 from "stripe";
import { eq as eq7 } from "drizzle-orm";
var router7 = Router6();
var stripe2 = new Stripe2(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-11-20.acacia"
});
var webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
router7.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    if (!webhookSecret || !signature) {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
      event = typeof req.body === "object" && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody);
    } else {
      event = stripe2.webhooks.constructEvent(req.body, signature, webhookSecret);
    }
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.id.startsWith("evt_test_")) {
    console.log("[Webhook] Test event detected, returning verification response");
    return res.json({ verified: true });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const reservationId = session.client_reference_id;
        if (reservationId) {
          const db = await getDb();
          let resv = null;
          if (db) {
            await db.update(reservations).set({
              statutPaiement: "paye",
              stripePaymentIntentId: session.payment_intent
            }).where(eq7(reservations.id, parseInt(reservationId)));
            const [r] = await db.select().from(reservations).where(eq7(reservations.id, parseInt(reservationId)));
            resv = r;
          }
          console.log(`[Webhook] Paiement confirm\xE9 pour r\xE9servation #${reservationId}`);
          if (resv) {
            const dateDebut = new Date(resv.dateDebut).toLocaleDateString("fr-FR");
            const dateFin = new Date(resv.dateFin).toLocaleDateString("fr-FR");
            const montant = (resv.montantPaye / 100).toLocaleString("fr-FR");
            const total = (resv.montantTotal / 100).toLocaleString("fr-FR");
            try {
              await notifyOwner({
                title: `\u2693 Nouvelle r\xE9servation confirm\xE9e : ${resv.nomClient}`,
                content: `**Client :** ${resv.nomClient} (${resv.emailClient}${resv.telClient ? " / " + resv.telClient : ""})
**Croisi\xE8re :** ${resv.formule} \u2014 ${resv.destination}
**Dates :** ${dateDebut} \u2192 ${dateFin}
**Personnes :** ${resv.nbPersonnes}
**Pay\xE9 :** ${montant} \u20AC${resv.typePaiement === "acompte" ? ` (acompte sur ${total} \u20AC)` : ""}
${resv.message ? "\n**Message :** " + resv.message : ""}`
              });
            } catch (e) {
              console.error("[Webhook] Erreur notifyOwner:", e);
            }
          }
        }
        break;
      }
      case "checkout.session.expired":
      case "payment_intent.payment_failed": {
        const obj = event.data.object;
        const reservationId = obj.client_reference_id || obj.metadata?.reservation_id;
        if (reservationId) {
          const db = await getDb();
          if (db) {
            await db.update(reservations).set({ statutPaiement: "echec" }).where(eq7(reservations.id, parseInt(reservationId)));
          }
        }
        break;
      }
      default:
        console.log(`[Webhook] Event non g\xE9r\xE9 : ${event.type}`);
    }
    res.json({ received: true });
  } catch (error) {
    console.error("[Webhook] Erreur lors du traitement:", error);
    res.status(500).json({ error: error.message });
  }
});
var stripeWebhook_default = router7;

// server/routes/ical.ts
import { Router as Router7 } from "express";
import ical from "node-ical";
import { eq as eq8, gte as gte2 } from "drizzle-orm";
var router8 = Router7();
var ICAL_KEY = "google_ical_url";
function isConfigTableMissingError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return message.includes('from "config"') || message.includes('relation "config"') || message.includes("config does not exist");
}
var cacheData = null;
var cacheTs = 0;
var CACHE_TTL_MS = 5 * 60 * 1e3;
var escapeIcs = (value) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
var toIcsDateTime = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
function detectDestination(text2) {
  const t2 = (text2 || "").toLowerCase();
  if (/antille|martinique|grenadin|caraib|caribb|guadeloupe|saintes/.test(t2)) {
    return "Antilles";
  }
  if (/atlantique|atlantic|transat|traverse/.test(t2)) {
    return "Travers\xE9e Atlantique";
  }
  if (/corse|sardaig|mediter|mediterr|baleare|italie/.test(t2)) {
    return "M\xE9diterran\xE9e";
  }
  return "M\xE9diterran\xE9e";
}
function detectStatut(summary) {
  const s = (summary || "").toLowerCase();
  if (/reserv|booked|confirm|vendu/.test(s)) return "reserve";
  if (/option|pending|tentative/.test(s)) return "option";
  if (/ferme|fermé|closed|indispo/.test(s)) return "ferme";
  return "disponible";
}
function detectTarif(text2) {
  if (!text2) return null;
  const match = text2.match(/(\d[\d\s]{2,})\s*(€|euros?|EUR)/i);
  if (match) {
    const num = parseInt(match[1].replace(/\s/g, ""), 10);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}
router8.get("/events", async (_req, res) => {
  try {
    if (cacheData && Date.now() - cacheTs < CACHE_TTL_MS) {
      return res.json(cacheData);
    }
    const db = await getDb();
    if (!db) return res.json([]);
    const [row] = await db.select().from(config).where(eq8(config.cle, ICAL_KEY)).limit(1);
    const url = row?.valeur;
    if (!url) return res.json([]);
    const events = await ical.async.fromURL(url);
    const parsed = [];
    for (const key in events) {
      const ev = events[key];
      if (!ev || ev.type !== "VEVENT") continue;
      if (!ev.start || !ev.end) continue;
      const summary = String(ev.summary || "");
      const description = String(ev.description || "");
      const location = String(ev.location || "");
      const combined = `${summary} ${description} ${location}`;
      parsed.push({
        uid: ev.uid,
        titre: summary,
        description,
        debut: new Date(ev.start).toISOString(),
        fin: new Date(ev.end).toISOString(),
        destination: detectDestination(combined),
        statut: detectStatut(summary),
        tarif: detectTarif(combined),
        source: "google-ical"
      });
    }
    parsed.sort((a, b) => new Date(a.debut).getTime() - new Date(b.debut).getTime());
    cacheData = parsed;
    cacheTs = Date.now();
    res.json(parsed);
  } catch (err) {
    if (isConfigTableMissingError(err)) {
      return res.json([]);
    }
    console.error("[iCal] Erreur:", err?.message || err);
    res.status(500).json({ error: err?.message || "Erreur iCal" });
  }
});
router8.post("/refresh", async (_req, res) => {
  cacheData = null;
  cacheTs = 0;
  res.json({ ok: true, message: "Cache iCal vid\xE9, prochain appel rechargera depuis Google" });
});
router8.get("/config", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.json({ url: "", exportUrl: "/api/ical/export.ics" });
    const [row] = await db.select().from(config).where(eq8(config.cle, ICAL_KEY)).limit(1);
    const origin = `${_req.protocol}://${_req.get("host")}`;
    res.json({
      url: row?.valeur || "",
      exportUrl: `${origin}/api/ical/export.ics`
    });
  } catch (err) {
    if (isConfigTableMissingError(err)) {
      const origin = `${_req.protocol}://${_req.get("host")}`;
      return res.json({
        url: "",
        exportUrl: `${origin}/api/ical/export.ics`
      });
    }
    return res.status(500).json({ error: err?.message || "Erreur lecture config iCal" });
  }
});
router8.put("/config", async (req, res) => {
  try {
    const { url } = req.body || {};
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB indisponible" });
    const [existing] = await db.select().from(config).where(eq8(config.cle, ICAL_KEY)).limit(1);
    if (existing) {
      await db.update(config).set({ valeur: url || "" }).where(eq8(config.cle, ICAL_KEY));
    } else {
      await db.insert(config).values({
        cle: ICAL_KEY,
        valeur: url || "",
        description: "URL iCal secr\xE8te du Google Agenda Sabine Sailing"
      });
    }
    cacheData = null;
    cacheTs = 0;
    res.json({ ok: true });
  } catch (err) {
    if (isConfigTableMissingError(err)) {
      return res.status(503).json({ error: "Table config absente. Lancez la migration base de donnees." });
    }
    return res.status(500).json({ error: err?.message || "Erreur ecriture config iCal" });
  }
});
router8.get("/export.ics", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).send("DB indisponible");
    const now = /* @__PURE__ */ new Date();
    const events = await db.select().from(disponibilites).where(gte2(disponibilites.fin, now)).orderBy(disponibilites.debut);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sabine Sailing//Planning Export//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Sabine Sailing Planning",
      "X-WR-TIMEZONE:UTC"
    ];
    for (const ev of events) {
      const title = `[${ev.planningType}] ${ev.destination} - ${ev.statut}`;
      const descriptionParts = [
        `Type: ${ev.planningType}`,
        `Statut: ${ev.statut}`,
        ev.notePublique ? `Public: ${ev.notePublique}` : "",
        ev.note ? `Prive: ${ev.note}` : ""
      ].filter(Boolean);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:dispo-${ev.id}@sabine-sailing.com`);
      lines.push(`DTSTAMP:${toIcsDateTime(/* @__PURE__ */ new Date())}`);
      lines.push(`DTSTART:${toIcsDateTime(new Date(ev.debut))}`);
      lines.push(`DTEND:${toIcsDateTime(new Date(ev.fin))}`);
      lines.push(`SUMMARY:${escapeIcs(title)}`);
      lines.push(`DESCRIPTION:${escapeIcs(descriptionParts.join("\n"))}`);
      lines.push(`LOCATION:${escapeIcs(ev.destination)}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="sabine-planning.ics"');
    return res.send(lines.join("\r\n"));
  } catch (err) {
    console.error("[iCal export] Erreur:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Erreur export iCal" });
  }
});
var ical_default = router8;

// server/routes/googleReviews.ts
import { Router as Router8 } from "express";

// server/_core/map.ts
function getMapsConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Google Maps proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey
  };
}
async function makeRequest(endpoint, params = {}, options = {}) {
  const { baseUrl, apiKey } = getMapsConfig();
  const url = new URL(`${baseUrl}/v1/maps/proxy${endpoint}`);
  url.searchParams.append("key", apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== void 0 && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : void 0
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Maps API request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }
  return await response.json();
}

// server/routes/googleReviews.ts
var router9 = Router8();
var DEFAULT_BUSINESS_QUERY = "Sabine Sailing La Ciotat";
var DEFAULT_PLACE_URL = "https://www.google.com/maps/search/?api=1&query=Sabine+Sailing+La+Ciotat";
router9.get("/", async (_req, res) => {
  try {
    let placeId = process.env.GOOGLE_PLACE_ID || "";
    if (!placeId) {
      const search = await makeRequest("/maps/api/place/textsearch/json", {
        query: DEFAULT_BUSINESS_QUERY
      });
      if (search.status !== "OK" || !search.results?.length) {
        return res.json({
          placeId: "",
          name: "Sabine Sailing",
          rating: 0,
          userRatingsTotal: 0,
          url: DEFAULT_PLACE_URL,
          reviews: []
        });
      }
      placeId = search.results?.[0]?.place_id || "";
    }
    if (!placeId) {
      return res.json({
        placeId: "",
        name: "Sabine Sailing",
        rating: 0,
        userRatingsTotal: 0,
        url: DEFAULT_PLACE_URL,
        reviews: []
      });
    }
    const details = await makeRequest("/maps/api/place/details/json", {
      place_id: placeId,
      fields: "place_id,name,rating,user_ratings_total,reviews,url",
      language: "fr"
    });
    if (details.status !== "OK" || !details.result) {
      return res.json({
        placeId,
        name: "Sabine Sailing",
        rating: 0,
        userRatingsTotal: 0,
        url: DEFAULT_PLACE_URL,
        reviews: []
      });
    }
    const place = details.result;
    const placeUrl = place.url;
    const reviews = (place.reviews || []).map((review) => ({
      authorName: review.author_name,
      rating: review.rating,
      text: review.text,
      time: review.time
    }));
    return res.json({
      placeId: place.place_id,
      name: place.name,
      rating: place.rating || 0,
      userRatingsTotal: place.user_ratings_total || 0,
      url: placeUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || DEFAULT_BUSINESS_QUERY)}`,
      reviews
    });
  } catch (error) {
    const message = error?.message || "Failed to fetch Google reviews";
    const missingProxyConfig = String(message).includes("Google Maps proxy credentials missing");
    if (missingProxyConfig) {
      return res.json({
        placeId: "",
        name: "Sabine Sailing",
        rating: 0,
        userRatingsTotal: 0,
        url: DEFAULT_PLACE_URL,
        reviews: []
      });
    }
    return res.status(500).json({ error: message });
  }
});
var googleReviews_default = router9;

// server/routes/contact.ts
import { Router as Router9 } from "express";
import nodemailer2 from "nodemailer";
var router10 = Router9();
var required = (value) => typeof value === "string" && value.trim().length > 0;
router10.post("/test-smtp", requireAdmin, async (_req, res) => {
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
        error: "Configuration email incompl\xE8te. D\xE9finissez SMTP_HOST, SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL et CONTACT_FROM_EMAIL."
      });
    }
    const transporter = nodemailer2.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
    await transporter.verify();
    return res.json({
      success: true,
      message: "Connexion SMTP OK.",
      smtp: { host, port, secure, user, fromEmail, toEmail }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Connexion SMTP impossible."
    });
  }
});
router10.post("/", async (req, res) => {
  try {
    const { nom, email, tel, message, formule } = req.body;
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
        error: "Configuration email incompl\xE8te. D\xE9finissez SMTP_HOST, SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL et CONTACT_FROM_EMAIL."
      });
    }
    const transporter = nodemailer2.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
    const safeTel = required(tel) ? tel : "Non renseign\xE9";
    const safeFormule = required(formule) ? formule : "Non pr\xE9cis\xE9e";
    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      replyTo: email,
      subject: `Nouvelle demande de contact \u2014 ${nom.trim()}`,
      text: [
        `Nom: ${nom.trim()}`,
        `Email: ${email.trim()}`,
        `T\xE9l\xE9phone: ${safeTel}`,
        `Formule: ${safeFormule}`,
        "",
        "Message:",
        message.trim()
      ].join("\n"),
      html: `
        <h2>Nouvelle demande de contact</h2>
        <p><strong>Nom:</strong> ${nom.trim()}</p>
        <p><strong>Email:</strong> ${email.trim()}</p>
        <p><strong>T\xE9l\xE9phone:</strong> ${safeTel}</p>
        <p><strong>Formule:</strong> ${safeFormule}</p>
        <p><strong>Message:</strong><br/>${message.trim().replace(/\n/g, "<br/>")}</p>
      `
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur lors de l'envoi du message." });
  }
});
var contact_default = router10;

// server/routes/workflow.ts
import { Router as Router10 } from "express";
import { and as and3, eq as eq9, inArray as inArray3 } from "drizzle-orm";

// server/storage.ts
import { mkdir, writeFile } from "node:fs/promises";
import path2 from "node:path";
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function isForgeConfigured() {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}
function getLocalStorageRoot() {
  return path2.resolve(process.cwd(), ".local-storage");
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (!isForgeConfigured()) {
    const fullPath = path2.join(getLocalStorageRoot(), key);
    await mkdir(path2.dirname(fullPath), { recursive: true });
    const payload = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    await writeFile(fullPath, payload);
    return { key, url: `/manus-storage/${key}` };
  }
  const { forgeUrl, forgeKey } = getForgeConfig();
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}
async function storageGetSignedUrl(relKey) {
  if (!isForgeConfigured()) {
    return `/manus-storage/${normalizeKey(relKey)}`;
  }
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = await resp.json();
  return url;
}

// server/_core/commercialDocs.ts
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { existsSync, readFileSync } from "node:fs";
import path3 from "node:path";
var COMPANY = {
  legalName: "SAS 3L Yachting",
  siret: "99130386800012",
  tva: "FR62991303868",
  address: "130 Traverse Haute Bertrandiere, 13600 La Ciotat, FR",
  email: "contact@3lyachting.com"
};
var euro = (cents) => (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u202f/g, " ").replace(/\u00a0/g, " ");
var dateFr = (value) => value ? new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
var sanitizePdfText = (input) => input.replace(/\u202f/g, " ").replace(/\u00a0/g, " ").replace(/[^\x20-\x7EÀ-ÿ]/g, "");
function resolveLogoPath() {
  const custom = process.env.QUOTE_LOGO_PATH;
  const candidates = [
    custom,
    path3.resolve(process.cwd(), "client", "public", "logo-sabine.png"),
    path3.resolve(process.cwd(), "public", "logo-sabine.png"),
    path3.resolve(process.cwd(), "logo-sabine.png")
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
async function embedImageByPath(doc, imgPath) {
  const bytes = readFileSync(imgPath);
  const lower = imgPath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return await doc.embedJpg(bytes);
  }
  return await doc.embedPng(bytes);
}
function resolveQuoteBoatBgPath() {
  const custom = process.env.QUOTE_BG_BOAT_PATH;
  const candidates = [
    custom,
    path3.resolve(process.cwd(), "client", "public", "docs", "boat-bg.png"),
    path3.resolve(process.cwd(), "client", "public", "docs", "devis-boat-bg.png"),
    "C:\\Users\\vleyd\\.cursor\\projects\\c-Users-vleyd-Desktop-catamaran-croisieres-22042026\\assets\\c__Users_vleyd_AppData_Roaming_Cursor_User_workspaceStorage_3ea31a7bc3a0390ead66e6911168ba79_images_noir_sans_fond-90096d3c-0aa4-4e07-853f-d2085ba8d522.png"
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
function resolveContractTemplatePath() {
  const raw = process.env.CONTRACT_TEMPLATE_PATH || "";
  const normalizedCustom = raw.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  const customWithPdf = normalizedCustom && !normalizedCustom.toLowerCase().endsWith(".pdf") ? `${normalizedCustom}.pdf` : normalizedCustom;
  const candidates = [
    normalizedCustom,
    customWithPdf,
    path3.resolve(process.cwd(), "client", "public", "docs", "contrat-template.pdf"),
    path3.resolve(process.cwd(), "client", "public", "docs", "contrat_modele.pdf"),
    path3.resolve(process.cwd(), "client", "public", "docs", "modele-contrat.pdf"),
    path3.resolve(process.cwd(), "client", "public", "docs", "contrat-charter-v2.pdf"),
    path3.resolve(process.cwd(), "public", "docs", "contrat-template.pdf")
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
async function renderPdf(title, lines) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 810;
  page.drawText(title, { x: 40, y, font: bold, size: 16, color: rgb(0.1, 0.1, 0.1) });
  y -= 24;
  for (const line of lines) {
    const safeLine = sanitizePdfText(line);
    const chunks = safeLine.length > 110 ? [safeLine.slice(0, 110), safeLine.slice(110)] : [safeLine];
    for (const c of chunks) {
      if (y < 50) break;
      page.drawText(c, { x: 40, y, font, size: 10, color: rgb(0.12, 0.12, 0.12) });
      y -= 14;
    }
    if (y < 50) break;
  }
  return await doc.save();
}
async function buildQuotePdf(r, quoteNumber, optionExpiresAt) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  try {
    const boatBgPath = resolveQuoteBoatBgPath();
    if (boatBgPath) {
      const boatImage = await embedImageByPath(doc, boatBgPath);
      const maxWidth = 470;
      const scale = Math.min(maxWidth / boatImage.width, 500 / boatImage.height);
      const dims = boatImage.scale(scale);
      page.drawImage(boatImage, {
        x: (595 - dims.width) / 2,
        y: 150,
        width: dims.width,
        height: dims.height,
        opacity: 0.12
      });
    }
  } catch (error) {
    console.warn("[QuotePDF] Fond bateau non charg\xE9:", error?.message || error);
  }
  const drawLabelValue = (y, label, value) => {
    page.drawText(sanitizePdfText(label), { x: 44, y, font: bold, size: 10, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(sanitizePdfText(value), { x: 170, y, font, size: 10, color: rgb(0.15, 0.15, 0.15) });
  };
  const totalTtc = r.montantTotal;
  const totalHt = Math.round(totalTtc / 1.1);
  const tva = totalTtc - totalHt;
  const expiresAt = /* @__PURE__ */ new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 15);
  const optionUntil = optionExpiresAt || (() => {
    const d = /* @__PURE__ */ new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  })();
  const isPrivate = r.typeReservation === "bateau_entier";
  page.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color: rgb(0.1, 0.2, 0.36) });
  try {
    const logoPath = resolveLogoPath();
    if (!logoPath) throw new Error("Logo introuvable");
    const logoImage = await embedImageByPath(doc, logoPath);
    const maxLogoWidth = 150;
    const maxLogoHeight = 52;
    const logoScale = Math.min(maxLogoWidth / logoImage.width, maxLogoHeight / logoImage.height);
    const logoDims = logoImage.scale(logoScale);
    page.drawImage(logoImage, {
      x: 555 - logoDims.width,
      y: 780 + (62 - logoDims.height) / 2,
      width: logoDims.width,
      height: logoDims.height,
      opacity: 1
    });
  } catch (error) {
    console.warn("[QuotePDF] Logo non charg\xE9:", error?.message || error);
  }
  page.drawText("DEVIS", { x: 44, y: 812, font: bold, size: 24, color: rgb(1, 1, 1) });
  page.drawText(sanitizePdfText(quoteNumber), { x: 44, y: 792, font, size: 11, color: rgb(0.9, 0.95, 1) });
  page.drawText(sanitizePdfText(COMPANY.legalName), { x: 360, y: 812, font: bold, size: 11, color: rgb(1, 1, 1) });
  page.drawText(sanitizePdfText(COMPANY.address), { x: 360, y: 797, font, size: 8.5, color: rgb(0.9, 0.95, 1) });
  page.drawText(`SIRET ${COMPANY.siret} | TVA ${COMPANY.tva}`, { x: 360, y: 784, font, size: 8.5, color: rgb(0.9, 0.95, 1) });
  page.drawText(`Emission: ${dateFr(/* @__PURE__ */ new Date())}`, { x: 44, y: 760, font, size: 9.5, color: rgb(0.25, 0.25, 0.25) });
  page.drawText(`Expiration: ${dateFr(expiresAt)}`, { x: 180, y: 760, font, size: 9.5, color: rgb(0.25, 0.25, 0.25) });
  page.drawRectangle({ x: 40, y: 640, width: 515, height: 105, borderColor: rgb(0.83, 0.85, 0.9), borderWidth: 1 });
  page.drawText("CLIENT", { x: 44, y: 730, font: bold, size: 11, color: rgb(0.1, 0.2, 0.36) });
  drawLabelValue(712, "Nom", r.nomClient);
  drawLabelValue(696, "Email", r.emailClient);
  drawLabelValue(680, "Telephone", r.telClient || "-");
  drawLabelValue(664, "Destination", r.destination);
  page.drawRectangle({ x: 40, y: 560, width: 515, height: 70, borderColor: rgb(0.83, 0.85, 0.9), borderWidth: 1 });
  page.drawText("PRESTATION", { x: 44, y: 614, font: bold, size: 11, color: rgb(0.1, 0.2, 0.36) });
  drawLabelValue(596, "Formule", r.formule);
  drawLabelValue(580, "Periode", `${dateFr(r.dateDebut)} au ${dateFr(r.dateFin)}`);
  drawLabelValue(564, "Blocage", `Option 7 jours (jusqu'au ${dateFr(optionUntil)})`);
  page.drawRectangle({ x: 40, y: 430, width: 515, height: 115, borderColor: rgb(0.83, 0.85, 0.9), borderWidth: 1 });
  page.drawText("DETAIL PRIX", { x: 44, y: 528, font: bold, size: 11, color: rgb(0.1, 0.2, 0.36) });
  page.drawText("Montant HT", { x: 44, y: 505, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`${euro(totalHt)} EUR`, { x: 450, y: 505, font: bold, size: 10, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("TVA (10%)", { x: 44, y: 486, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`${euro(tva)} EUR`, { x: 450, y: 486, font: bold, size: 10, color: rgb(0.2, 0.2, 0.2) });
  page.drawLine({ start: { x: 44, y: 472 }, end: { x: 550, y: 472 }, thickness: 1, color: rgb(0.86, 0.88, 0.92) });
  page.drawText("TOTAL TTC", { x: 44, y: 452, font: bold, size: 12, color: rgb(0.1, 0.2, 0.36) });
  page.drawText(`${euro(totalTtc)} EUR`, { x: 430, y: 452, font: bold, size: 14, color: rgb(0.1, 0.2, 0.36) });
  page.drawRectangle({ x: 40, y: 290, width: 515, height: 125, borderColor: rgb(0.83, 0.85, 0.9), borderWidth: 1 });
  page.drawText("CONDITIONS DE PAIEMENT", { x: 44, y: 398, font: bold, size: 11, color: rgb(0.1, 0.2, 0.36) });
  page.drawText(isPrivate ? "- Acompte 10 % a la reservation" : "- Acompte 20 % a la reservation", { x: 44, y: 378, font, size: 10, color: rgb(0.15, 0.15, 0.15) });
  page.drawText(isPrivate ? "- Solde 60 jours avant depart" : "- Solde 45 jours avant depart", { x: 44, y: 362, font, size: 10, color: rgb(0.15, 0.15, 0.15) });
  page.drawText("Reglement par virement bancaire", { x: 44, y: 343, font: bold, size: 10, color: rgb(0.15, 0.15, 0.15) });
  page.drawText("IBAN FR76 1695 8000 0129 3037 2555 023", { x: 44, y: 327, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("BIC QNTOFRP1XXX", { x: 44, y: 313, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
  page.drawRectangle({ x: 40, y: 150, width: 515, height: 130, borderColor: rgb(0.83, 0.85, 0.9), borderWidth: 1 });
  page.drawText("RAPPEL INCLUS / NON INCLUS", { x: 44, y: 262, font: bold, size: 11, color: rgb(0.1, 0.2, 0.36) });
  if (isPrivate) {
    page.drawText("Inclus:", { x: 44, y: 244, font: bold, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Mise a disposition exclusive du navire avec equipage professionnel.", { x: 95, y: 244, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Hebergement a bord selon capacite autorisee, 2 paddles et 1 kayak.", { x: 95, y: 230, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("Non inclus:", { x: 44, y: 212, font: bold, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Carburant, avitaillement alimentaire et boissons (caisse de bord).", { x: 110, y: 212, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Options: bouee tractee, scooters sous-marins, moteur electrique paddle.", { x: 110, y: 198, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
  } else {
    page.drawText("Inclus:", { x: 44, y: 244, font: bold, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Hebergement en cabine, equipage, pension complete.", { x: 95, y: 244, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Boissons de base pendant les repas, carburant programme standard.", { x: 95, y: 230, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Materiel de loisirs: snorkeling, paddle, kayak.", { x: 95, y: 216, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("Non inclus:", { x: 44, y: 198, font: bold, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Transport vers/depuis le port, depenses a terre, assurances personnelles.", { x: 110, y: 198, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("- Options: bouee tractee, scooters sous-marins, moteur electrique paddle.", { x: 110, y: 184, font, size: 9.5, color: rgb(0.2, 0.2, 0.2) });
  }
  page.drawLine({ start: { x: 40, y: 78 }, end: { x: 555, y: 78 }, thickness: 1, color: rgb(0.86, 0.88, 0.92) });
  page.drawText("Bon pour accord client:", { x: 44, y: 58, font: bold, size: 10, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Signature: ____________________   Date: ____________________", { x: 180, y: 58, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("SAS 3L Yachting - contact@3lyachting.com", { x: 44, y: 34, font, size: 8.5, color: rgb(0.45, 0.45, 0.45) });
  return await doc.save();
}
async function buildContractPdf(r, contractNumber) {
  const templatePath = resolveContractTemplatePath();
  if (!templatePath) {
    throw new Error(
      "[CONTRACT_TEMPLATE_REQUIRED] Mod\xE8le contrat introuvable. Ajoutez CONTRACT_TEMPLATE_PATH dans .env vers votre PDF mod\xE8le."
    );
  }
  const templateDoc = await PDFDocument.load(readFileSync(templatePath));
  const pages = templateDoc.getPages();
  const font = await templateDoc.embedFont(StandardFonts.Helvetica);
  const bold = await templateDoc.embedFont(StandardFonts.HelveticaBold);
  const firstPage = pages[0];
  const firstSize = firstPage.getSize();
  const isPrivate = r.typeReservation === "bateau_entier";
  const [firstNameRaw, ...lastNameParts] = String(r.nomClient || "").trim().split(/\s+/);
  const firstName = firstNameRaw || "-";
  const lastName = lastNameParts.join(" ") || "-";
  const drawField = (label, value, y) => {
    firstPage.drawText(`${sanitizePdfText(label)}:`, {
      x: 42,
      y,
      font: bold,
      size: 9,
      color: rgb(0.1, 0.1, 0.1)
    });
    firstPage.drawText(sanitizePdfText(value), {
      x: 178,
      y,
      font,
      size: 9,
      color: rgb(0.1, 0.1, 0.1)
    });
  };
  const topY = Math.max(540, firstSize.height - 170);
  firstPage.drawRectangle({
    x: 36,
    y: topY - 132,
    width: Math.min(523, firstSize.width - 72),
    height: 142,
    color: rgb(1, 1, 1),
    opacity: 0.88
  });
  firstPage.drawText("INFORMATIONS RENSEIGNEES AUTOMATIQUEMENT", {
    x: 42,
    y: topY - 14,
    font: bold,
    size: 10,
    color: rgb(0.1, 0.1, 0.1)
  });
  drawField("Reference dossier", contractNumber, topY - 30);
  drawField("Nom", lastName, topY - 44);
  drawField("Prenom", firstName, topY - 58);
  drawField("Telephone", r.telClient || "-", topY - 72);
  drawField("Email", r.emailClient || "-", topY - 86);
  drawField("Navire", "Catamaran Sabine", topY - 100);
  drawField("Destination", r.destination || "-", topY - 114);
  drawField("Date d'embarquement", dateFr(r.dateDebut) || "-", topY - 128);
  drawField("Date de debarquement", dateFr(r.dateFin) || "-", topY - 142);
  firstPage.drawText(`Type: ${isPrivate ? "PRIVATISATION BATEAU ENTIER" : "CROISIERE A LA CABINE"}`, {
    x: 42,
    y: topY - 156,
    font: bold,
    size: 9,
    color: rgb(0.1, 0.1, 0.1)
  });
  firstPage.drawText(`${isPrivate ? "[X]" : "[ ]"} Privatisation`, {
    x: 330,
    y: topY - 114,
    font,
    size: 9,
    color: rgb(0.1, 0.1, 0.1)
  });
  firstPage.drawText(`${isPrivate ? "[ ]" : "[X]"} Cabine`, {
    x: 330,
    y: topY - 128,
    font,
    size: 9,
    color: rgb(0.1, 0.1, 0.1)
  });
  const lastPage = pages[pages.length - 1];
  const lastSize = lastPage.getSize();
  const today = dateFr(/* @__PURE__ */ new Date());
  lastPage.drawText(
    `Periode: ${sanitizePdfText(dateFr(r.dateDebut))} au ${sanitizePdfText(dateFr(r.dateFin))}`,
    {
      x: 36,
      y: 96,
      font: bold,
      size: 9,
      color: rgb(0.12, 0.12, 0.12)
    }
  );
  lastPage.drawText(`Total: ${sanitizePdfText(euro(r.montantTotal))} EUR`, {
    x: 36,
    y: 82,
    font: bold,
    size: 9,
    color: rgb(0.12, 0.12, 0.12)
  });
  lastPage.drawText("Document genere depuis le modele contractuel client.", {
    x: 36,
    y: 12,
    font,
    size: 7.5,
    color: rgb(0.4, 0.4, 0.4)
  });
  lastPage.drawLine({
    start: { x: Math.max(36, lastSize.width - 240), y: 64 },
    end: { x: Math.max(160, lastSize.width - 40), y: 64 },
    thickness: 1,
    color: rgb(0.25, 0.25, 0.25)
  });
  lastPage.drawText("Signature armateur: SAS 3L Yachting", {
    x: Math.max(36, lastSize.width - 240),
    y: 68,
    font,
    size: 8,
    color: rgb(0.15, 0.15, 0.15)
  });
  lastPage.drawText(`Date: ${sanitizePdfText(today)}`, {
    x: Math.max(36, lastSize.width - 240),
    y: 54,
    font,
    size: 8,
    color: rgb(0.15, 0.15, 0.15)
  });
  return await templateDoc.save();
}
async function buildQuoteContractPdf(r, quoteNumber, contractNumber, optionExpiresAt) {
  try {
    const quoteBytes = await buildQuotePdf(r, quoteNumber, optionExpiresAt);
    const contractBytes = await buildContractPdf(r, contractNumber);
    const merged = await PDFDocument.create();
    const quoteDoc = await PDFDocument.load(quoteBytes);
    const contractDoc = await PDFDocument.load(contractBytes);
    const quotePages = await merged.copyPages(quoteDoc, quoteDoc.getPageIndices());
    quotePages.forEach((p) => merged.addPage(p));
    const contractPages = await merged.copyPages(contractDoc, contractDoc.getPageIndices());
    contractPages.forEach((p) => merged.addPage(p));
    return await merged.save();
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("[CONTRACT_TEMPLATE_REQUIRED]")) {
      throw error;
    }
    console.warn("[QuoteContractPDF] Fusion standard \xE9chou\xE9e, fallback activ\xE9:", error?.message || error);
    const lines = [
      "DOCUMENT COMMUN DEVIS + CONTRAT",
      "",
      `Devis: ${quoteNumber}`,
      `Contrat: ${contractNumber}`,
      `Client: ${r.nomClient} - ${r.emailClient}`,
      `Destination: ${r.destination}`,
      `Periode: ${dateFr(r.dateDebut)} au ${dateFr(r.dateFin)}`,
      `Montant total: ${euro(r.montantTotal)} EUR`,
      "",
      "Ce document fallback a ete genere automatiquement pour garantir la continuit\xE9 du workflow commercial.",
      "Le devis et le contrat ont ete regroupes dans ce meme PDF."
    ];
    return await renderPdf(`DEVIS + CONTRAT ${quoteNumber}`, lines);
  }
}
async function buildInvoicePdf(r, invoiceNumber, type, amount, dueAt) {
  const lines = [
    `Numero facture: ${invoiceNumber}`,
    `Date facture: ${dateFr(/* @__PURE__ */ new Date())}`,
    "",
    `${COMPANY.legalName} - ${COMPANY.address}`,
    `Email: ${COMPANY.email} | SIRET: ${COMPANY.siret} | TVA: ${COMPANY.tva}`,
    "",
    `Client: ${r.nomClient} | ${r.emailClient}`,
    `Reservation: ${r.destination} du ${dateFr(r.dateDebut)} au ${dateFr(r.dateFin)}`,
    "",
    `Type: ${type === "acompte" ? "Acompte de reservation" : "Solde de reservation"}`,
    `Montant: ${euro(amount)} EUR`,
    `Echeance: ${dateFr(dueAt)}`,
    "",
    "Reglement par virement:",
    "IBAN FR76 1695 8000 0129 3037 2555 023",
    "BIC QNTOFRP1XXX"
  ];
  return renderPdf(`FACTURE ${invoiceNumber}`, lines);
}

// server/_core/esign.ts
var provider = (process.env.ESIGN_PROVIDER || "other").toLowerCase();
function getProvider() {
  if (provider === "yousign" || provider === "docusign") return provider;
  return "other";
}
async function dispatchYousign(input) {
  const apiKey = process.env.ESIGN_YOUSIGN_API_KEY;
  const baseUrl = (process.env.ESIGN_YOUSIGN_BASE_URL || "https://api-sandbox.yousign.app/v3").replace(/\/+$/, "");
  if (!apiKey) throw new Error("ESIGN_YOUSIGN_API_KEY manquant");
  const response = await fetch(`${baseUrl}/signature_requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: `Contrat ${input.contractNumber}`,
      delivery_mode: "none",
      timezone: "Europe/Paris",
      signers: [
        {
          info: {
            first_name: input.signerName.split(" ")[0] || input.signerName,
            last_name: input.signerName.split(" ").slice(1).join(" ") || "Client",
            email: input.signerEmail
          },
          signature_level: "electronic_signature"
        }
      ],
      documents: [
        {
          name: `Contrat ${input.contractNumber}.pdf`,
          from_url: input.contractDownloadUrl
        }
      ],
      metadata: {
        source: "sabine-sailing",
        contractNumber: input.contractNumber
      },
      webhook_subscription: {
        callback_url: input.webhookUrl
      }
    })
  });
  if (!response.ok) {
    const details = await response.text().catch(() => response.statusText);
    throw new Error(`Yousign error ${response.status}: ${details}`);
  }
  const payload = await response.json();
  return {
    provider: "yousign",
    envelopeId: String(payload.id || payload.signature_request_id || `yousign-${Date.now()}`),
    signUrl: payload.signers?.[0]?.signature_link || payload.signing_url || null,
    sentAt: /* @__PURE__ */ new Date()
  };
}
async function dispatchDocusign(input) {
  const accountId = process.env.ESIGN_DOCUSIGN_ACCOUNT_ID;
  const accessToken = process.env.ESIGN_DOCUSIGN_ACCESS_TOKEN;
  const basePath = (process.env.ESIGN_DOCUSIGN_BASE_PATH || "").replace(/\/+$/, "");
  if (!accountId || !accessToken || !basePath) {
    throw new Error("ESIGN_DOCUSIGN_ACCOUNT_ID / ESIGN_DOCUSIGN_ACCESS_TOKEN / ESIGN_DOCUSIGN_BASE_PATH manquants");
  }
  const response = await fetch(`${basePath}/v2.1/accounts/${accountId}/envelopes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      emailSubject: `Contrat ${input.contractNumber}`,
      status: "sent",
      documents: [
        {
          documentBase64: null,
          name: `Contrat ${input.contractNumber}.pdf`,
          fileExtension: "pdf",
          documentId: "1",
          remoteUrl: input.contractDownloadUrl
        }
      ],
      recipients: {
        signers: [
          {
            email: input.signerEmail,
            name: input.signerName,
            recipientId: "1",
            routingOrder: "1"
          }
        ]
      },
      eventNotification: {
        url: input.webhookUrl,
        includeEnvelopeVoidReason: "true",
        includeTimeZone: "true",
        loggingEnabled: "true",
        envelopeEvents: [{ envelopeEventStatusCode: "completed" }]
      }
    })
  });
  if (!response.ok) {
    const details = await response.text().catch(() => response.statusText);
    throw new Error(`DocuSign error ${response.status}: ${details}`);
  }
  const payload = await response.json();
  return {
    provider: "docusign",
    envelopeId: String(payload.envelopeId || `docusign-${Date.now()}`),
    signUrl: null,
    sentAt: /* @__PURE__ */ new Date()
  };
}
async function dispatchEsign(input) {
  const p = getProvider();
  if (p === "yousign") return dispatchYousign(input);
  if (p === "docusign") return dispatchDocusign(input);
  return {
    provider: "other",
    envelopeId: `manual-${Date.now()}`,
    signUrl: null,
    sentAt: /* @__PURE__ */ new Date()
  };
}

// server/routes/workflow.ts
var router11 = Router10();
var nowYear = () => (/* @__PURE__ */ new Date()).getUTCFullYear();
var pad = (n) => String(n).padStart(4, "0");
var buildQuoteNumber = (id) => `DV-${nowYear()}-${pad(id)}`;
var buildContractNumber = (id) => `CT-${nowYear()}-${pad(id)}`;
var buildInvoiceNumber = (id, type) => `FAC-${type.toUpperCase()}-${nowYear()}-${pad(id)}`;
async function resolveDisponibiliteIdForReservation2(db, r) {
  if (r.disponibiliteId) return r.disponibiliteId;
  const rows = await db.select().from(disponibilites);
  const reservationStart = new Date(r.dateDebut).toISOString().slice(0, 10);
  const reservationEnd = new Date(r.dateFin).toISOString().slice(0, 10);
  let match = rows.find((d) => {
    const dStart = new Date(d.debut).toISOString().slice(0, 10);
    const dEnd = new Date(d.fin).toISOString().slice(0, 10);
    return dStart === reservationStart && dEnd === reservationEnd;
  });
  if (!match) {
    const rStartMs = new Date(r.dateDebut).getTime();
    const rEndMs = new Date(r.dateFin).getTime();
    match = rows.find((d) => {
      const dStartMs = new Date(d.debut).getTime();
      const dEndMs = new Date(d.fin).getTime();
      return rStartMs < dEndMs && rEndMs > dStartMs;
    });
  }
  if (!match?.id) return null;
  await db.update(reservations).set({ disponibiliteId: match.id, updatedAt: /* @__PURE__ */ new Date() }).where(eq9(reservations.id, r.id));
  return match.id;
}
async function refreshDisponibiliteBookingState2(db, disponibiliteId) {
  const dispoRows = await db.select().from(disponibilites).where(eq9(disponibilites.id, disponibiliteId)).limit(1);
  const dispo = dispoRows[0];
  if (!dispo) return;
  if (dispo.planningType && dispo.planningType !== "charter") {
    await db.update(disponibilites).set({
      statut: "ferme",
      cabinesReservees: 0,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq9(disponibilites.id, disponibiliteId));
    return;
  }
  const bookedReservations = await db.select().from(reservations).where(
    and3(
      eq9(reservations.disponibiliteId, disponibiliteId),
      inArray3(reservations.workflowStatut, ["contrat_signe", "acompte_confirme", "solde_confirme"])
    )
  );
  const hasPrivate = bookedReservations.some((r) => r.typeReservation === "bateau_entier");
  const reservedCabins = hasPrivate ? dispo.capaciteTotale : bookedReservations.filter((r) => r.typeReservation === "cabine" || r.typeReservation === "place").reduce((sum, r) => sum + Math.max(1, r.nbCabines || 1), 0);
  const clampedReservedCabins = Math.max(0, Math.min(dispo.capaciteTotale || 4, reservedCabins));
  let statut = "disponible";
  if (hasPrivate || clampedReservedCabins >= (dispo.capaciteTotale || 4)) {
    statut = "reserve";
  } else if (clampedReservedCabins > 0) {
    statut = "option";
  }
  await db.update(disponibilites).set({
    statut,
    cabinesReservees: clampedReservedCabins,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq9(disponibilites.id, disponibiliteId));
}
router11.post("/reservations/:id/owner-validate", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const existing = await db.select().from(reservations).where(eq9(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "R\xE9servation introuvable" });
    const r = existing[0];
    const optionExpiresAt = /* @__PURE__ */ new Date();
    optionExpiresAt.setUTCDate(optionExpiresAt.getUTCDate() + 7);
    const acompteMontant = Math.round(r.montantTotal * 20 / 100);
    const soldeMontant = Math.max(0, r.montantTotal - acompteMontant);
    const soldeEcheanceAt = new Date(r.dateDebut);
    soldeEcheanceAt.setUTCDate(soldeEcheanceAt.getUTCDate() - 45);
    await db.update(reservations).set({
      workflowStatut: "validee_owner",
      acomptePercent: 20,
      acompteMontant,
      soldeMontant,
      soldeEcheanceAt,
      ownerValidatedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq9(reservations.id, reservationId));
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation2(db, r);
    if (linkedDisponibiliteId) {
      await db.update(disponibilites).set({
        statut: "option",
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq9(disponibilites.id, linkedDisponibiliteId));
    }
    const quoteNumber = buildQuoteNumber(reservationId);
    const contractNumber = buildContractNumber(reservationId);
    const combinedPdf = await buildQuoteContractPdf(r, quoteNumber, contractNumber, optionExpiresAt);
    const combinedFile = await storagePut(
      `commercial/combined/devis-contrat-${reservationId}.pdf`,
      combinedPdf,
      "application/pdf"
    );
    const existingQuotes = await db.select().from(quotes).where(eq9(quotes.reservationId, reservationId));
    let quoteId = null;
    if (existingQuotes.length) {
      const existingQuote = existingQuotes.slice().sort((a, b) => b.id - a.id)[0];
      await db.update(quotes).set({
        quoteNumber,
        totalAmount: r.montantTotal,
        currency: "EUR",
        pdfStorageKey: combinedFile.key
      }).where(eq9(quotes.id, existingQuote.id));
      quoteId = existingQuote.id;
    } else {
      const quoteInsert = await db.insert(quotes).values({
        reservationId,
        quoteNumber,
        totalAmount: r.montantTotal,
        currency: "EUR",
        pdfStorageKey: combinedFile.key
      }).returning({ id: quotes.id });
      quoteId = quoteInsert[0]?.id ?? null;
    }
    const existingContracts = await db.select().from(contracts).where(eq9(contracts.reservationId, reservationId));
    let createdContract;
    if (existingContracts.length) {
      const existingContract = existingContracts.slice().sort((a, b) => b.id - a.id)[0];
      await db.update(contracts).set({
        quoteId,
        contractNumber,
        pdfStorageKey: combinedFile.key
      }).where(eq9(contracts.id, existingContract.id));
      createdContract = {
        id: existingContract.id,
        contractNumber,
        pdfStorageKey: combinedFile.key
      };
    } else {
      const contractInsert = await db.insert(contracts).values({
        reservationId,
        quoteId,
        contractNumber,
        pdfStorageKey: combinedFile.key,
        esignProvider: "other"
      }).returning({ id: contracts.id, contractNumber: contracts.contractNumber, pdfStorageKey: contracts.pdfStorageKey });
      createdContract = contractInsert[0];
    }
    await db.update(reservations).set({
      workflowStatut: "validee_owner",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq9(reservations.id, reservationId));
    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "validee_owner",
      actorType: "admin",
      note: "R\xE9servation valid\xE9e par le propri\xE9taire. Devis et contrat g\xE9n\xE9r\xE9s (en attente d'envoi)."
    });
    return res.json({
      success: true,
      acompteMontant,
      soldeMontant,
      soldeEcheanceAt,
      optionExpiresAt,
      quoteUrl: combinedFile.url,
      contractUrl: combinedFile.url,
      contractId: createdContract.id
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur workflow owner validation" });
  }
});
router11.post("/reservations/:id/send-contract", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const existing = await db.select().from(reservations).where(eq9(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "R\xE9servation introuvable" });
    const r = existing[0];
    const contractRows = await db.select().from(contracts).where(eq9(contracts.reservationId, reservationId));
    if (!contractRows.length) {
      return res.status(400).json({ error: "Aucun contrat g\xE9n\xE9r\xE9. Validez d'abord la r\xE9servation." });
    }
    const contract = contractRows.slice().sort((a, b) => b.id - a.id)[0];
    if (!contract.pdfStorageKey) {
      return res.status(400).json({ error: "Contrat sans fichier PDF." });
    }
    let esignProvider = "other";
    let esignEnvelopeId = `manual-${reservationId}-${Date.now()}`;
    let signUrl = null;
    let sentAt = null;
    try {
      const signedUrl = await storageGetSignedUrl(contract.pdfStorageKey);
      const webhookBase = `${req.protocol}://${req.get("host")}`;
      const result = await dispatchEsign({
        contractNumber: contract.contractNumber,
        signerName: r.nomClient,
        signerEmail: r.emailClient,
        contractDownloadUrl: signedUrl,
        webhookUrl: `${webhookBase}/api/workflow/esign/webhook`
      });
      esignProvider = result.provider;
      esignEnvelopeId = result.envelopeId;
      signUrl = result.signUrl;
      sentAt = result.sentAt;
    } catch {
      esignProvider = "other";
      esignEnvelopeId = `manual-${reservationId}-${Date.now()}`;
      sentAt = /* @__PURE__ */ new Date();
    }
    await db.update(contracts).set({
      esignProvider,
      esignEnvelopeId,
      sentAt
    }).where(eq9(contracts.id, contract.id));
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation2(db, r);
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState2(db, linkedDisponibiliteId);
    }
    await db.update(reservations).set({
      workflowStatut: "contrat_envoye",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq9(reservations.id, reservationId));
    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "contrat_envoye",
      actorType: "admin",
      note: "Contrat envoy\xE9 au client pour signature."
    });
    return res.json({
      success: true,
      esign: {
        provider: esignProvider,
        envelopeId: esignEnvelopeId,
        signUrl,
        webhookUrl: "/api/workflow/esign/webhook"
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur envoi contrat" });
  }
});
router11.post("/reservations/:id/acompte-received", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const existing = await db.select().from(reservations).where(eq9(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "R\xE9servation introuvable" });
    const r = existing[0];
    const acompteAmount = r.acompteMontant || Math.round(r.montantTotal * 20 / 100);
    if (r.workflowStatut === "acompte_confirme") {
      const linkedDisponibiliteId2 = await resolveDisponibiliteIdForReservation2(db, r);
      await db.update(reservations).set({
        workflowStatut: "contrat_envoye",
        montantPaye: 0,
        statutPaiement: "en_attente",
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq9(reservations.id, reservationId));
      if (linkedDisponibiliteId2) {
        await db.update(disponibilites).set({
          statut: "option",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq9(disponibilites.id, linkedDisponibiliteId2));
      }
      await db.insert(reservationStatusHistory).values({
        reservationId,
        fromStatut: "acompte_confirme",
        toStatut: "contrat_envoye",
        actorType: "admin",
        note: "Annulation de la confirmation d'acompte (second clic)."
      });
      if (linkedDisponibiliteId2) {
        await refreshDisponibiliteBookingState2(db, linkedDisponibiliteId2);
      }
      return res.json({ success: true, cancelled: true, acompteAmount: 0, invoiceUrl: null });
    }
    await db.update(reservations).set({
      workflowStatut: "acompte_confirme",
      montantPaye: acompteAmount,
      statutPaiement: "en_attente",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq9(reservations.id, reservationId));
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation2(db, r);
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState2(db, linkedDisponibiliteId);
    }
    const existingAcompteInvoice = await db.select().from(invoices).where(and3(eq9(invoices.reservationId, reservationId), eq9(invoices.invoiceType, "acompte"))).limit(1);
    let invoiceUrl = null;
    if (existingAcompteInvoice.length) {
      invoiceUrl = existingAcompteInvoice[0].pdfStorageKey ? await storageGetSignedUrl(existingAcompteInvoice[0].pdfStorageKey).catch(() => null) : null;
    } else {
      const invoiceNumber = buildInvoiceNumber(reservationId, "acompte");
      const invoicePdf = await buildInvoicePdf(r, invoiceNumber, "acompte", acompteAmount, /* @__PURE__ */ new Date());
      const invoiceFile = await storagePut(
        `commercial/invoices/invoice-acompte-${reservationId}.pdf`,
        invoicePdf,
        "application/pdf"
      );
      await db.insert(invoices).values({
        reservationId,
        invoiceNumber,
        invoiceType: "acompte",
        amount: acompteAmount,
        currency: "EUR",
        dueAt: /* @__PURE__ */ new Date(),
        paidAt: /* @__PURE__ */ new Date(),
        pdfStorageKey: invoiceFile.key
      });
      invoiceUrl = invoiceFile.url;
    }
    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "acompte_confirme",
      actorType: "admin",
      note: "Acompte de 20% confirm\xE9 manuellement (virement re\xE7u). Le cr\xE9neau passe d'option \xE0 r\xE9servation."
    });
    return res.json({ success: true, acompteAmount, invoiceUrl });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur confirmation acompte" });
  }
});
router11.post("/reservations/:id/contract-signed", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const existing = await db.select().from(reservations).where(eq9(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "R\xE9servation introuvable" });
    const r = existing[0];
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation2(db, r);
    await db.update(reservations).set({
      workflowStatut: "contrat_signe",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq9(reservations.id, reservationId));
    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "contrat_signe",
      actorType: "admin",
      note: "Contrat marqu\xE9 comme sign\xE9 manuellement depuis le backoffice."
    });
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState2(db, linkedDisponibiliteId);
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur validation contrat" });
  }
});
router11.post("/reservations/:id/solde-received", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const existing = await db.select().from(reservations).where(eq9(reservations.id, reservationId));
    if (!existing.length) return res.status(404).json({ error: "R\xE9servation introuvable" });
    const r = existing[0];
    const soldeAmount = r.soldeMontant || Math.max(0, r.montantTotal - (r.acompteMontant || 0));
    const acompteAmount = r.acompteMontant || Math.round(r.montantTotal * 20 / 100);
    if (r.workflowStatut === "solde_confirme") {
      const linkedDisponibiliteId2 = await resolveDisponibiliteIdForReservation2(db, r);
      await db.update(reservations).set({
        workflowStatut: "acompte_confirme",
        montantPaye: acompteAmount,
        statutPaiement: "en_attente",
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq9(reservations.id, reservationId));
      if (linkedDisponibiliteId2) {
        await db.update(disponibilites).set({
          statut: "reserve",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq9(disponibilites.id, linkedDisponibiliteId2));
      }
      await db.insert(reservationStatusHistory).values({
        reservationId,
        fromStatut: "solde_confirme",
        toStatut: "acompte_confirme",
        actorType: "admin",
        note: "Annulation de la confirmation du solde (second clic)."
      });
      if (linkedDisponibiliteId2) {
        await refreshDisponibiliteBookingState2(db, linkedDisponibiliteId2);
      }
      return res.json({ success: true, cancelled: true, soldeAmount: 0, invoiceUrl: null });
    }
    await db.update(reservations).set({
      workflowStatut: "solde_confirme",
      montantPaye: r.montantTotal,
      statutPaiement: "paye",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq9(reservations.id, reservationId));
    const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation2(db, r);
    if (linkedDisponibiliteId) {
      await refreshDisponibiliteBookingState2(db, linkedDisponibiliteId);
    }
    const existingSoldeInvoice = await db.select().from(invoices).where(and3(eq9(invoices.reservationId, reservationId), eq9(invoices.invoiceType, "solde"))).limit(1);
    let invoiceUrl = null;
    if (existingSoldeInvoice.length) {
      invoiceUrl = existingSoldeInvoice[0].pdfStorageKey ? await storageGetSignedUrl(existingSoldeInvoice[0].pdfStorageKey).catch(() => null) : null;
    } else {
      const invoiceNumber = buildInvoiceNumber(reservationId, "solde");
      const invoicePdf = await buildInvoicePdf(
        r,
        invoiceNumber,
        "solde",
        soldeAmount,
        r.soldeEcheanceAt || /* @__PURE__ */ new Date()
      );
      const invoiceFile = await storagePut(
        `commercial/invoices/invoice-solde-${reservationId}.pdf`,
        invoicePdf,
        "application/pdf"
      );
      await db.insert(invoices).values({
        reservationId,
        invoiceNumber,
        invoiceType: "solde",
        amount: soldeAmount,
        currency: "EUR",
        dueAt: r.soldeEcheanceAt || /* @__PURE__ */ new Date(),
        paidAt: /* @__PURE__ */ new Date(),
        pdfStorageKey: invoiceFile.key
      });
      invoiceUrl = invoiceFile.url;
    }
    await db.insert(reservationStatusHistory).values({
      reservationId,
      fromStatut: r.workflowStatut,
      toStatut: "solde_confirme",
      actorType: "admin",
      note: "Solde confirm\xE9 manuellement (virement re\xE7u)."
    });
    return res.json({ success: true, soldeAmount, invoiceUrl });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur confirmation solde" });
  }
});
router11.get("/reservations/:id/documents", requireAdmin, async (req, res) => {
  try {
    const reservationId = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const [quoteList, contractList, invoiceList] = await Promise.all([
      db.select().from(quotes).where(eq9(quotes.reservationId, reservationId)),
      db.select().from(contracts).where(eq9(contracts.reservationId, reservationId)),
      db.select().from(invoices).where(eq9(invoices.reservationId, reservationId))
    ]);
    const quotesWithUrls = await Promise.all(
      quoteList.map(async (q) => ({
        ...q,
        downloadUrl: q.pdfStorageKey ? await storageGetSignedUrl(q.pdfStorageKey).catch(() => null) : null
      }))
    );
    const contractsWithUrls = await Promise.all(
      contractList.map(async (c) => ({
        ...c,
        downloadUrl: c.pdfStorageKey ? await storageGetSignedUrl(c.pdfStorageKey).catch(() => null) : null
      }))
    );
    const invoicesWithUrls = await Promise.all(
      invoiceList.map(async (i) => ({
        ...i,
        downloadUrl: i.pdfStorageKey ? await storageGetSignedUrl(i.pdfStorageKey).catch(() => null) : null
      }))
    );
    return res.json({
      quotes: quotesWithUrls,
      contracts: contractsWithUrls,
      invoices: invoicesWithUrls
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur listing documents" });
  }
});
router11.post("/esign/webhook", async (req, res) => {
  try {
    const expectedSecret = process.env.ESIGN_WEBHOOK_SECRET || ENV.cookieSecret;
    const incomingSecret = req.headers["x-webhook-secret"];
    if (!expectedSecret || incomingSecret !== expectedSecret) {
      return res.status(401).json({ error: "Webhook non autoris\xE9" });
    }
    const { contractId, envelopeId, provider: provider2, eventType, payload } = req.body || {};
    if (!eventType || !contractId && !envelopeId) {
      return res.status(400).json({ error: "eventType + (contractId ou envelopeId) requis" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    let resolvedContractId = contractId ? parseInt(contractId, 10) : null;
    if (!resolvedContractId && envelopeId) {
      const matched = await db.select().from(contracts).where(eq9(contracts.esignEnvelopeId, String(envelopeId)));
      resolvedContractId = matched[0]?.id ?? null;
    }
    if (!resolvedContractId) {
      return res.status(404).json({ error: "Contrat e-sign introuvable" });
    }
    await db.insert(esignEvents).values({
      contractId: resolvedContractId,
      provider: provider2 || "other",
      eventType: String(eventType),
      payload: payload ? JSON.stringify(payload) : null
    });
    const event = String(eventType).toLowerCase();
    const isSigned = event.includes("signed") || event.includes("completed") || event.includes("done") || event.includes("signature_request.done");
    if (isSigned) {
      await db.update(contracts).set({ signedAt: /* @__PURE__ */ new Date() }).where(eq9(contracts.id, resolvedContractId));
      const linked = await db.select().from(contracts).where(eq9(contracts.id, resolvedContractId));
      const reservationId = linked[0]?.reservationId;
      if (reservationId) {
        const current = await db.select().from(reservations).where(eq9(reservations.id, reservationId));
        const previous = current[0];
        await db.update(reservations).set({ workflowStatut: "contrat_signe", updatedAt: /* @__PURE__ */ new Date() }).where(eq9(reservations.id, reservationId));
        const linkedDisponibiliteId = await resolveDisponibiliteIdForReservation2(db, previous);
        if (linkedDisponibiliteId) {
          await refreshDisponibiliteBookingState2(db, linkedDisponibiliteId);
        }
        await db.insert(reservationStatusHistory).values({
          reservationId,
          fromStatut: previous?.workflowStatut || null,
          toStatut: "contrat_signe",
          actorType: "system",
          note: "Contrat sign\xE9 via webhook e-sign."
        });
      }
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur webhook e-sign" });
  }
});
var workflow_default = router11;

// server/routes/customerAuth.ts
import { Router as Router11 } from "express";
import { SignJWT as SignJWT3, jwtVerify as jwtVerify2 } from "jose";
import nodemailer3 from "nodemailer";
import { parse as parseCookie } from "cookie";
import { createHash, randomBytes as randomBytes3 } from "node:crypto";
import { eq as eq10, and as and4, gte as gte3 } from "drizzle-orm";
var router12 = Router11();
var CUSTOMER_COOKIE2 = "customer_session_id";
var MAGIC_LINK_TTL_MIN = 30;
var required2 = (value) => typeof value === "string" && value.trim().length > 0;
var sha256 = (value) => createHash("sha256").update(value).digest("hex");
async function signCustomerSession2(email) {
  const secret = new TextEncoder().encode(ENV.cookieSecret || "dev-secret");
  return await new SignJWT3({ email, type: "customer" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret);
}
async function sendMagicLink(email, token, reqOrigin) {
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
    const transporter = nodemailer3.createTransport({ host, port, secure, auth: { user, pass } });
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
        "L'equipe Sabine Sailing"
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
      `
    });
    return { sent: true, fallbackLink: url };
  } catch (error) {
    console.warn("[CustomerAuth] SMTP indisponible, lien de secours utilis\xE9:", error?.message || error);
    return { sent: false, fallbackLink: url };
  }
}
router12.post("/request-link", async (req, res) => {
  try {
    const { email, origin } = req.body;
    if (!required2(email)) return res.status(400).json({ error: "Email requis" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.select().from(customers).where(eq10(customers.email, normalizedEmail)).limit(1);
    if (!existing.length) {
      await db.insert(customers).values({ email: normalizedEmail, authMethod: "magic_link" });
    }
    const rawToken = randomBytes3(32).toString("hex");
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1e3);
    await db.insert(customerMagicLinks).values({
      customerEmail: normalizedEmail,
      tokenHash: sha256(rawToken),
      expiresAt
    });
    const requestOrigin = required2(origin) && /^https?:\/\//i.test(origin.trim()) ? origin.trim().replace(/\/+$/, "") : `${req.protocol}://${req.get("host")}`;
    const result = await sendMagicLink(normalizedEmail, rawToken, requestOrigin);
    return res.json({
      success: true,
      message: result.sent ? "Lien envoy\xE9 par email" : "Email indisponible, lien direct g\xE9n\xE9r\xE9",
      // Toujours renvoyé pour que le client puisse se connecter même si l'email n'arrive pas.
      loginLink: result.fallbackLink,
      emailSent: result.sent
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur demande magic link" });
  }
});
router12.post("/login-password", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!required2(email) || !required2(password)) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await db.select().from(customers).where(eq10(customers.email, normalizedEmail)).limit(1);
    const customer = rows[0];
    if (!customer?.passwordHash) {
      return res.status(401).json({ error: "Compte introuvable ou mot de passe non d\xE9fini" });
    }
    const valid = await verifyCustomerPassword(password, customer.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }
    const jwt = await signCustomerSession2(normalizedEmail);
    res.cookie(CUSTOMER_COOKIE2, jwt, getSessionCookieOptions(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur connexion mot de passe" });
  }
});
router12.post("/verify", async (req, res) => {
  try {
    const { token } = req.body;
    if (!required2(token)) return res.status(400).json({ error: "Token requis" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const tokenHash = sha256(token);
    const rows = await db.select().from(customerMagicLinks).where(and4(eq10(customerMagicLinks.tokenHash, tokenHash), gte3(customerMagicLinks.expiresAt, /* @__PURE__ */ new Date()))).limit(1);
    const link = rows[0];
    if (!link) return res.status(400).json({ error: "Lien invalide ou expir\xE9" });
    await db.update(customerMagicLinks).set({ usedAt: /* @__PURE__ */ new Date() }).where(eq10(customerMagicLinks.id, link.id));
    const jwt = await signCustomerSession2(link.customerEmail);
    res.cookie(CUSTOMER_COOKIE2, jwt, getSessionCookieOptions(req));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur v\xE9rification magic link" });
  }
});
router12.get("/me", async (req, res) => {
  try {
    const cookies = parseCookie(req.headers.cookie || "");
    const token = cookies[CUSTOMER_COOKIE2];
    if (!token) return res.status(401).json({ error: "Non connect\xE9" });
    const secret = new TextEncoder().encode(ENV.cookieSecret || "dev-secret");
    const payload = (await jwtVerify2(token, secret)).payload;
    if (!payload?.email || payload.type !== "customer") return res.status(401).json({ error: "Session invalide" });
    return res.json({ email: payload.email });
  } catch {
    return res.status(401).json({ error: "Session expir\xE9e" });
  }
});
router12.post("/logout", async (req, res) => {
  res.clearCookie(CUSTOMER_COOKIE2, getSessionCookieOptions(req));
  res.json({ success: true });
});
var customerAuth_default = router12;

// server/routes/customerPortal.ts
import { Router as Router12 } from "express";
import { jwtVerify as jwtVerify3 } from "jose";
import { and as and5, eq as eq11 } from "drizzle-orm";
import { parse as parseCookie2 } from "cookie";
var router13 = Router12();
var CUSTOMER_COOKIE3 = "customer_session_id";
async function getCustomerEmailFromRequest(req) {
  try {
    const cookies = parseCookie2(req.headers.cookie || "");
    const token = cookies[CUSTOMER_COOKIE3];
    if (!token) return null;
    const secret = new TextEncoder().encode(ENV.cookieSecret || "dev-secret");
    const payload = (await jwtVerify3(token, secret)).payload;
    if (!payload?.email || payload.type !== "customer") return null;
    return payload.email;
  } catch {
    return null;
  }
}
router13.get("/reservations", async (req, res) => {
  try {
    const email = await getCustomerEmailFromRequest(req);
    if (!email) return res.status(401).json({ error: "Non connect\xE9" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const rows = await db.select().from(reservations).where(eq11(reservations.emailClient, email));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur chargement r\xE9servations" });
  }
});
router13.get("/documents", async (req, res) => {
  try {
    const email = await getCustomerEmailFromRequest(req);
    if (!email) return res.status(401).json({ error: "Non connect\xE9" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const customer = await db.select().from(customers).where(eq11(customers.email, email)).limit(1);
    if (!customer.length) return res.json([]);
    const docs = await db.select().from(documents).where(eq11(documents.customerId, customer[0].id));
    return res.json(docs);
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur chargement documents" });
  }
});
router13.post("/documents/upload", async (req, res) => {
  try {
    const email = await getCustomerEmailFromRequest(req);
    if (!email) return res.status(401).json({ error: "Non connect\xE9" });
    const { reservationId, docType, originalName, mimeType, base64Data } = req.body;
    if (!docType || !originalName || !mimeType || !base64Data) {
      return res.status(400).json({ error: "Donn\xE9es upload manquantes" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const customer = await db.select().from(customers).where(eq11(customers.email, email)).limit(1);
    if (!customer.length) return res.status(404).json({ error: "Client introuvable" });
    const customerId = customer[0].id;
    if (reservationId) {
      const ownedReservation = await db.select().from(reservations).where(and5(eq11(reservations.id, reservationId), eq11(reservations.emailClient, email))).limit(1);
      if (!ownedReservation.length) return res.status(403).json({ error: "R\xE9servation non autoris\xE9e" });
    }
    const buffer = Buffer.from(base64Data, "base64");
    const uploaded = await storagePut(
      `customers/${customerId}/documents/${Date.now()}-${originalName}`,
      buffer,
      mimeType
    );
    const inserted = await db.insert(documents).values({
      reservationId: reservationId || null,
      customerId,
      category: "identity",
      docType,
      originalName,
      mimeType,
      sizeBytes: buffer.byteLength,
      storageKey: uploaded.key,
      isSensitive: true,
      uploadedByType: "customer",
      uploadedById: customerId
    }).returning({ id: documents.id });
    return res.json({ success: true, documentId: inserted[0]?.id, url: uploaded.url });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur upload document" });
  }
});
var customerPortal_default = router13;

// server/routes/adminDocuments.ts
import { Router as Router13 } from "express";
import { eq as eq12 } from "drizzle-orm";
var router14 = Router13();
router14.get("/boat", requireAdmin, async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const rows = await db.select().from(documents).where(eq12(documents.category, "boat"));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur listing documents bateau" });
  }
});
router14.post("/boat/upload", requireAdmin, async (req, res) => {
  try {
    const { docType, originalName, mimeType, base64Data, expiresAt } = req.body;
    if (!docType || !originalName || !mimeType || !base64Data) {
      return res.status(400).json({ error: "Donn\xE9es manquantes" });
    }
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.byteLength) {
      return res.status(400).json({ error: "Fichier vide ou base64 invalide" });
    }
    const uploaded = await storagePut(`boat/documents/${Date.now()}-${originalName}`, buffer, mimeType);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const inserted = await db.insert(documents).values({
      category: "boat",
      docType,
      originalName,
      mimeType,
      sizeBytes: buffer.byteLength,
      storageKey: uploaded.key,
      isSensitive: true,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      uploadedByType: "admin",
      uploadedById: null
    }).returning({ id: documents.id });
    return res.json({ success: true, id: inserted[0]?.id, url: uploaded.url });
  } catch (error) {
    const message = error?.message || "Erreur upload document bateau";
    if (String(message).includes("Storage config missing")) {
      return res.status(500).json({
        error: "Configuration stockage manquante. Renseignez BUILT_IN_FORGE_API_URL et BUILT_IN_FORGE_API_KEY dans .env, puis red\xE9marrez le serveur."
      });
    }
    return res.status(500).json({ error: error?.message || "Erreur upload document bateau" });
  }
});
router14.get("/boat/:id/preview-url", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalide" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const rows = await db.select().from(documents).where(eq12(documents.id, id)).limit(1);
    const doc = rows[0];
    if (!doc || doc.category !== "boat") {
      return res.status(404).json({ error: "Document introuvable" });
    }
    const previewUrl = await storageGetSignedUrl(doc.storageKey);
    return res.json({ success: true, previewUrl });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erreur ouverture aper\xE7u document" });
  }
});
var adminDocuments_default = router14;

// server/routes/backofficeOps.ts
import { Router as Router14 } from "express";
import { eq as eq13 } from "drizzle-orm";
var router15 = Router14();
router15.use(requireAdmin);
function mapDbError(error, fallback) {
  const message = String(error?.message || "");
  if (message.includes("relation") && message.includes("does not exist")) {
    return "Tables maintenance/\xE9quipage absentes en base. Lancez `pnpm drizzle-kit push` puis red\xE9marrez le serveur.";
  }
  return error?.message || fallback;
}
router15.get("/crew", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const rows = await db.select().from(crewMembers);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: mapDbError(error, "Erreur liste \xE9quipage") });
  }
});
router15.post("/crew", async (req, res) => {
  try {
    const { fullName, role, phone, email, certifications, availabilityNote } = req.body || {};
    if (!fullName || !role) return res.status(400).json({ error: "Nom et r\xF4le requis" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const inserted = await db.insert(crewMembers).values({
      fullName: String(fullName),
      role: String(role),
      phone: phone || null,
      email: email || null,
      certifications: certifications || null,
      availabilityNote: availabilityNote || null
    }).returning({ id: crewMembers.id });
    return res.json({ success: true, id: inserted[0]?.id });
  } catch (error) {
    return res.status(500).json({ error: mapDbError(error, "Erreur cr\xE9ation \xE9quipage") });
  }
});
router15.put("/crew/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { fullName, role, phone, email, certifications, availabilityNote } = req.body || {};
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    await db.update(crewMembers).set({
      fullName: fullName || void 0,
      role: role || void 0,
      phone: phone || void 0,
      email: email || void 0,
      certifications: certifications || void 0,
      availabilityNote: availabilityNote || void 0,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq13(crewMembers.id, id));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: mapDbError(error, "Erreur mise \xE0 jour \xE9quipage") });
  }
});
router15.delete("/crew/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    await db.delete(crewMembers).where(eq13(crewMembers.id, id));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: mapDbError(error, "Erreur suppression \xE9quipage") });
  }
});
router15.get("/maintenance/tasks", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const rows = await db.select().from(maintenanceTasks);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: mapDbError(error, "Erreur liste maintenance") });
  }
});
router15.post("/maintenance/tasks", async (req, res) => {
  try {
    const {
      title,
      system,
      boatArea,
      intervalHours,
      intervalDays,
      lastDoneEngineHours,
      currentEngineHours,
      lastDoneAt,
      nextDueAt,
      sparePartsLocation,
      boatPlanRef,
      procedureNote,
      isCritical,
      isDone
    } = req.body || {};
    if (!title || !system) return res.status(400).json({ error: "Titre et syst\xE8me requis" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    const inserted = await db.insert(maintenanceTasks).values({
      title: String(title),
      system: String(system),
      boatArea: boatArea || null,
      intervalHours: intervalHours ? parseInt(intervalHours, 10) : null,
      intervalDays: intervalDays ? parseInt(intervalDays, 10) : null,
      lastDoneEngineHours: lastDoneEngineHours ? parseInt(lastDoneEngineHours, 10) : null,
      currentEngineHours: currentEngineHours ? parseInt(currentEngineHours, 10) : null,
      lastDoneAt: lastDoneAt ? new Date(lastDoneAt) : null,
      nextDueAt: nextDueAt ? new Date(nextDueAt) : null,
      sparePartsLocation: sparePartsLocation || null,
      boatPlanRef: boatPlanRef || null,
      procedureNote: procedureNote || null,
      isCritical: Boolean(isCritical),
      isDone: Boolean(isDone)
    }).returning({ id: maintenanceTasks.id });
    return res.json({ success: true, id: inserted[0]?.id });
  } catch (error) {
    return res.status(500).json({ error: mapDbError(error, "Erreur cr\xE9ation maintenance") });
  }
});
router15.put("/maintenance/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const payload = req.body || {};
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    await db.update(maintenanceTasks).set({
      title: payload.title || void 0,
      system: payload.system || void 0,
      boatArea: payload.boatArea ?? void 0,
      intervalHours: payload.intervalHours !== void 0 ? payload.intervalHours ? parseInt(payload.intervalHours, 10) : null : void 0,
      intervalDays: payload.intervalDays !== void 0 ? payload.intervalDays ? parseInt(payload.intervalDays, 10) : null : void 0,
      lastDoneEngineHours: payload.lastDoneEngineHours !== void 0 ? payload.lastDoneEngineHours ? parseInt(payload.lastDoneEngineHours, 10) : null : void 0,
      currentEngineHours: payload.currentEngineHours !== void 0 ? payload.currentEngineHours ? parseInt(payload.currentEngineHours, 10) : null : void 0,
      lastDoneAt: payload.lastDoneAt !== void 0 ? payload.lastDoneAt ? new Date(payload.lastDoneAt) : null : void 0,
      nextDueAt: payload.nextDueAt !== void 0 ? payload.nextDueAt ? new Date(payload.nextDueAt) : null : void 0,
      sparePartsLocation: payload.sparePartsLocation ?? void 0,
      boatPlanRef: payload.boatPlanRef ?? void 0,
      procedureNote: payload.procedureNote ?? void 0,
      isCritical: payload.isCritical !== void 0 ? Boolean(payload.isCritical) : void 0,
      isDone: payload.isDone !== void 0 ? Boolean(payload.isDone) : void 0,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq13(maintenanceTasks.id, id));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: mapDbError(error, "Erreur mise \xE0 jour maintenance") });
  }
});
router15.delete("/maintenance/tasks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Base de donn\xE9es non disponible" });
    await db.delete(maintenanceTasks).where(eq13(maintenanceTasks.id, id));
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: mapDbError(error, "Erreur suppression maintenance") });
  }
});
var backofficeOps_default = router15;

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path5 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path4 from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path4.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path4.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  base: process.env.VITE_BASE_PATH || (process.env.NODE_ENV === "production" ? "/home/" : "/"),
  plugins,
  resolve: {
    alias: {
      "@": path4.resolve(import.meta.dirname, "client", "src"),
      "@shared": path4.resolve(import.meta.dirname, "shared"),
      "@assets": path4.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path4.resolve(import.meta.dirname),
  root: path4.resolve(import.meta.dirname, "client"),
  publicDir: path4.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path4.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
var normalizeBasePath = (rawPath) => {
  const fallback = "/home";
  const candidate = (rawPath || fallback).trim();
  if (!candidate) return fallback;
  const withLeadingSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
};
var appBasePath = normalizeBasePath(process.env.APP_BASE_PATH || process.env.VITE_BASE_PATH);
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path5.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path5.resolve(import.meta.dirname, "../..", "dist", "public") : path5.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use(appBasePath, express.static(distPath));
  app.get("/", (_req, res) => {
    res.redirect(302, `${appBasePath}/`);
  });
  app.use(`${appBasePath}/*`, (_req, res) => {
    res.sendFile(path5.resolve(distPath, "index.html"));
  });
  app.use("*", (_req, res) => {
    res.sendFile(path5.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
var apiRateBuckets = /* @__PURE__ */ new Map();
function applySecurityHeaders(req, res, next) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://www.googletagmanager.com https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https://www.youtube.com https://www.marinetraffic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}
function apiRateLimit(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const windowMs = 6e4;
  const max = req.path.includes("/customer-auth") ? 20 : 120;
  const bucket = apiRateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    apiRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (bucket.count >= max) {
    return res.status(429).json({ error: "Trop de requ\xEAtes, r\xE9essayez dans 1 minute." });
  }
  bucket.count += 1;
  next();
}
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use(applySecurityHeaders);
  app.use(apiRateLimit);
  app.use("/api/stripe/webhook", express2.raw({ type: "application/json" }), stripeWebhook_default);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerLocalAdminPages(app);
  registerAdminAuthRoutes(app);
  app.use("/api/disponibilites", disponibilites_default);
  app.use("/api/avis", avis_default);
  app.use("/api/reservations", reservations_default);
  app.use("/api/cabines-reservees", cabines_default);
  app.use("/api/stripe", stripe_default);
  app.use("/api/ical", ical_default);
  app.use("/api/google-reviews", googleReviews_default);
  app.use("/api/contact", contact_default);
  app.use("/api/workflow", workflow_default);
  app.use("/api/customer-auth", customerAuth_default);
  app.use("/api/customer-portal", customerPortal_default);
  app.use("/api/admin-documents", adminDocuments_default);
  app.use("/api/backoffice-ops", backofficeOps_default);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
