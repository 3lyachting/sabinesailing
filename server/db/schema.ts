import { pgTable, text, timestamp, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const disponibilites = pgTable("disponibilites", {
  id: text("id").primaryKey(),
  debut: timestamp("debut").notNull(),
  fin: timestamp("fin").notNull(),
  statut: varchar("statut", { length: 50 }).notNull(), // "disponible", "reserve", "option", "ferme"
  tarif: integer("tarif"), // en euros
  destination: varchar("destination", { length: 255 }).notNull(), // "Méditerranée", "Antilles", "Traversée Atlantique"
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Schémas Zod pour validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
});

export const insertDisponibiliteSchema = createInsertSchema(disponibilites).pick({
  debut: true,
  fin: true,
  statut: true,
  tarif: true,
  destination: true,
  note: true,
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Disponibilite = typeof disponibilites.$inferSelect;
export type NewDisponibilite = typeof disponibilites.$inferInsert;
