import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: jsonb("position").$type<[number, number, number]>().notNull(),
  rotation: jsonb("rotation").$type<[number, number, number]>().notNull(),
  scale: jsonb("scale").$type<[number, number, number]>().notNull(),
});

export const insertModelSchema = createInsertSchema(models);
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Model = typeof models.$inferSelect;
