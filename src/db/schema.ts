import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const images = sqliteTable("images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull(),
  date: text("date").notNull(), // ISO date string
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  imageId: integer("image_id")
    .notNull()
    .references(() => images.id, { onDelete: "cascade" }),
  term: text("term").notNull(),
  category: text("category"),
  description: text("description"),
});
