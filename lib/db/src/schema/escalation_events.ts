import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { invoicesTable } from "./invoices";

export const escalationEventsTable = pgTable("escalation_events", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id),
  stage: text("stage").notNull(),
  message: text("message").notNull(),
  channel: text("channel").notNull().default("system"),
  approvedByOwner: boolean("approved_by_owner").notNull().default(false),
  language: text("language"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEscalationEventSchema = createInsertSchema(escalationEventsTable).omit({ id: true, createdAt: true });
export type InsertEscalationEvent = z.infer<typeof insertEscalationEventSchema>;
export type EscalationEvent = typeof escalationEventsTable.$inferSelect;
