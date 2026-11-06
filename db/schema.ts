import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const licenseKeys = pgTable("license_keys", {
  id: serial().primaryKey(),
  key: text().notNull().unique(),
  // Thời hạn tính bằng giờ (tối thiểu 1). null = vĩnh viễn
  durationHours: integer("duration_hours"),
  note: text(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  deviceId: text("device_id"),
  revoked: boolean().notNull().default(false),
});
