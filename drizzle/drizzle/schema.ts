import { boolean, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const disponibiliteStatutEnum = pgEnum("disponibilite_statut", ["disponible", "reserve", "option", "ferme"]);
export const typeReservationEnum = pgEnum("type_reservation", ["bateau_entier", "cabine", "place"]);
export const typePaiementEnum = pgEnum("type_paiement", ["acompte", "complet"]);
export const statutPaiementEnum = pgEnum("statut_paiement", ["en_attente", "paye", "echec", "rembourse"]);
export const planningTypeEnum = pgEnum("planning_type", ["charter", "technical_stop", "maintenance", "blocked"]);
export const customerAuthMethodEnum = pgEnum("customer_auth_method", ["magic_link", "password"]);
export const reservationWorkflowStatutEnum = pgEnum("reservation_workflow_statut", [
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
  "solde_confirme",
]);
export const documentCategoryEnum = pgEnum("document_category", ["identity", "reservation", "boat"]);
export const esignProviderEnum = pgEnum("esign_provider", ["yousign", "docusign", "other"]);

export const users = pgTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const disponibilites = pgTable("disponibilites", {
  id: serial("id").primaryKey(),
  planningType: planningTypeEnum("planningType").default("charter").notNull(),
  debut: timestamp("debut").notNull(),
  fin: timestamp("fin").notNull(),
  statut: disponibiliteStatutEnum("statut").notNull(),
  tarif: integer("tarif"), // tarif bateau entier en euros (ou 1 place pour transat)
  tarifCabine: integer("tarifCabine"), // tarif par cabine double en euros (Med/Caraïbes)
  tarifJourPersonne: integer("tarifJourPersonne"), // tarif par jour et par personne (cabine/journee)
  tarifJourPriva: integer("tarifJourPriva"), // tarif par jour pour bateau entier (privatif)
  destination: varchar("destination", { length: 255 }).notNull(), // "Méditerranée", "Antilles", "Traversée Atlantique"
  capaciteTotale: integer("capaciteTotale").default(4).notNull(), // 4 cabines (Med/Caraïbes) ou 4 places (transat)
  cabinesReservees: integer("cabinesReservees").default(0).notNull(), // nb cabines/places déjà réservées
  note: text("note"), // note privée (admin interne)
  notePublique: text("notePublique"), // texte affiché sur le site public
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Disponibilite = typeof disponibilites.$inferSelect;
export type InsertDisponibilite = typeof disponibilites.$inferInsert;

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  firstName: varchar("firstName", { length: 120 }),
  lastName: varchar("lastName", { length: 120 }),
  phone: varchar("phone", { length: 50 }),
  authMethod: customerAuthMethodEnum("authMethod").default("magic_link").notNull(),
  passwordHash: text("passwordHash"),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const customerMagicLinks = pgTable("customerMagicLinks", {
  id: serial("id").primaryKey(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const avis = pgTable("avis", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  note: integer("note").notNull(), // 1 à 5
  titre: varchar("titre", { length: 255 }).notNull(),
  contenu: text("contenu").notNull(),
  destination: varchar("destination", { length: 255 }), // Méditerranée, Antilles, Traversée Atlantique
  approuve: boolean("approuve").default(false).notNull(), // Modération
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Avis = typeof avis.$inferSelect;
export type InsertAvis = typeof avis.$inferInsert;

export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  // Informations client
  nomClient: varchar("nomClient", { length: 255 }).notNull(),
  emailClient: varchar("emailClient", { length: 320 }).notNull(),
  customerId: integer("customerId"),
  telClient: varchar("telClient", { length: 50 }),
  nbPersonnes: integer("nbPersonnes").notNull(),
  // Infos croisière
  disponibiliteId: integer("disponibiliteId"), // Lien vers la semaine réservée
  formule: varchar("formule", { length: 50 }).notNull(), // "semaine", "weekend", "journee", "traversee"
  typeReservation: typeReservationEnum("typeReservation").default("bateau_entier").notNull(),
  nbCabines: integer("nbCabines").default(1).notNull(), // nb cabines (Med/Caraïbes) ou nb places (transat)
  destination: varchar("destination", { length: 255 }).notNull(),
  dateDebut: timestamp("dateDebut").notNull(),
  dateFin: timestamp("dateFin").notNull(),
  montantTotal: integer("montantTotal").notNull(), // en centimes (€)
  typePaiement: typePaiementEnum("typePaiement").notNull(),
  montantPaye: integer("montantPaye").notNull(), // en centimes (€)
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = typeof reservations.$inferInsert;

export const reservationStatusHistory = pgTable("reservationStatusHistory", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  fromStatut: reservationWorkflowStatutEnum("fromStatut"),
  toStatut: reservationWorkflowStatutEnum("toStatut").notNull(),
  actorType: varchar("actorType", { length: 30 }).notNull(), // admin|customer|system
  actorId: integer("actorId"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  quoteNumber: varchar("quoteNumber", { length: 50 }).notNull().unique(),
  totalAmount: integer("totalAmount").notNull(),
  currency: varchar("currency", { length: 10 }).default("EUR").notNull(),
  pdfStorageKey: text("pdfStorageKey"),
  sentAt: timestamp("sentAt"),
  acceptedAt: timestamp("acceptedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  quoteId: integer("quoteId"),
  contractNumber: varchar("contractNumber", { length: 50 }).notNull().unique(),
  pdfStorageKey: text("pdfStorageKey"),
  esignProvider: esignProviderEnum("esignProvider").default("other").notNull(),
  esignEnvelopeId: varchar("esignEnvelopeId", { length: 255 }),
  sentAt: timestamp("sentAt"),
  signedAt: timestamp("signedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull().unique(),
  invoiceType: varchar("invoiceType", { length: 30 }).notNull(), // acompte|solde|full
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("EUR").notNull(),
  dueAt: timestamp("dueAt"),
  paidAt: timestamp("paidAt"),
  pdfStorageKey: text("pdfStorageKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const paymentConfirmations = pgTable("paymentConfirmations", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservationId").notNull(),
  invoiceId: integer("invoiceId"),
  paymentType: varchar("paymentType", { length: 20 }).notNull(), // acompte|solde
  amount: integer("amount").notNull(),
  confirmedBy: integer("confirmedBy"),
  confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
  note: text("note"),
});

export const esignEvents = pgTable("esignEvents", {
  id: serial("id").primaryKey(),
  contractId: integer("contractId").notNull(),
  provider: esignProviderEnum("provider").default("other").notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  payload: text("payload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
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
  uploadedByType: varchar("uploadedByType", { length: 20 }).notNull(), // admin|customer|system
  uploadedById: integer("uploadedById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const crewMembers = pgTable("crewMembers", {
  id: serial("id").primaryKey(),
  fullName: varchar("fullName", { length: 180 }).notNull(),
  role: varchar("role", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  certifications: text("certifications"),
  availabilityNote: text("availabilityNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const maintenanceTasks = pgTable("maintenanceTasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  system: varchar("system", { length: 120 }).notNull(), // ex: moteur tribord, gréement, électrique
  boatArea: varchar("boatArea", { length: 120 }), // ex: soute avant babord
  intervalHours: integer("intervalHours"), // ex: vidange toutes les 500h
  intervalDays: integer("intervalDays"), // ex: contrôle annuel
  lastDoneEngineHours: integer("lastDoneEngineHours"),
  currentEngineHours: integer("currentEngineHours"),
  lastDoneAt: timestamp("lastDoneAt"),
  nextDueAt: timestamp("nextDueAt"),
  sparePartsLocation: text("sparePartsLocation"), // emplacement des pièces de rechange
  boatPlanRef: text("boatPlanRef"), // référence plan/document
  procedureNote: text("procedureNote"),
  isCritical: boolean("isCritical").default(false).notNull(),
  isDone: boolean("isDone").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const cabinesReservees = pgTable("cabinesReservees", {
  id: serial("id").primaryKey(),
  disponibiliteId: integer("disponibiliteId").notNull(),
  nbReservees: integer("nbReservees").default(0).notNull(),
  nbTotal: integer("nbTotal").default(4).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CabinesReservees = typeof cabinesReservees.$inferSelect;
export type InsertCabinesReservees = typeof cabinesReservees.$inferInsert;

export const config = pgTable("config", {
  id: serial("id").primaryKey(),
  cle: varchar("cle", { length: 100 }).notNull().unique(),
  valeur: text("valeur"),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Config = typeof config.$inferSelect;
export type InsertConfig = typeof config.$inferInsert;
