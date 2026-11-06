import { createHash } from "node:crypto";

export function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

/** Secret dùng để xác thực webhook, suy ra từ token bot (không lộ token). */
export function webhookSecret(): string {
  return createHash("sha256").update("pb-webhook:" + botToken()).digest("hex").slice(0, 48);
}

export function adminIds(): string[] {
  return (process.env.TELEGRAM_ADMIN_IDS ?? "")
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function tg(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({ ok: false }));
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
