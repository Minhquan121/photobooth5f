import type { Config } from "@netlify/functions";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { licenseKeys } from "../../db/schema.js";
import { normalizeKey } from "../../db/keys.js";

const fail = (message: string, status = 200) => Response.json({ ok: false, message }, { status });

export default async (req: Request) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Dữ liệu không hợp lệ", 400);
  }
  const key = normalizeKey(body?.key);
  const deviceId = String(body?.deviceId ?? "").slice(0, 100);
  if (!key || !deviceId) return fail("Vui lòng nhập key");

  let [row] = await db.select().from(licenseKeys).where(eq(licenseKeys.key, key)).limit(1);
  if (!row) return fail("Key không tồn tại");
  if (row.revoked) return fail("Key đã bị khoá");

  // Kích hoạt lần đầu: bắt đầu tính thời hạn và gắn với thiết bị này
  if (!row.activatedAt) {
    const now = new Date();
    const expiresAt = row.durationHours === null ? null : new Date(now.getTime() + row.durationHours * 3600_000);
    const [updated] = await db
      .update(licenseKeys)
      .set({ activatedAt: now, expiresAt, deviceId })
      .where(and(eq(licenseKeys.id, row.id), isNull(licenseKeys.activatedAt)))
      .returning();
    if (updated) row = updated;
    else [row] = await db.select().from(licenseKeys).where(eq(licenseKeys.id, row.id)).limit(1);
  } else if (!row.deviceId) {
    // Key đã được admin reset thiết bị -> gắn với thiết bị mới
    const [updated] = await db
      .update(licenseKeys)
      .set({ deviceId })
      .where(and(eq(licenseKeys.id, row.id), isNull(licenseKeys.deviceId)))
      .returning();
    if (updated) row = updated;
    else [row] = await db.select().from(licenseKeys).where(eq(licenseKeys.id, row.id)).limit(1);
  }

  if (row.deviceId !== deviceId) return fail("Key đã được sử dụng trên thiết bị khác");
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return fail("Key đã hết hạn");

  return Response.json({
    ok: true,
    key: row.key,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  });
};

export const config: Config = {
  path: "/api/key/verify",
  method: "POST",
};
