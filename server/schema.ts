import { pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

// User table schema
export const users = pgTable('users', {
  id: varchar('id').primaryKey().notNull().$defaultFn(() => createId()),
  googleId: varchar('google_id').notNull().unique(),
  name: varchar('name').notNull(),
  email: varchar('email').notNull().unique(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}); 