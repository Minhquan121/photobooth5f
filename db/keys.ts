import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateKey(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `PB-${part()}-${part()}-${part()}`;
}

export function normalizeKey(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Chuyển chuỗi thời hạn thành số giờ. Trả về null = vĩnh viễn, undefined = không hợp lệ.
 * Hỗ trợ: 1h, 12h, 1d, 7d, 2w, 1m (30 ngày), số trơn = ngày, "vv"/"vinhvien" = vĩnh viễn.
 */
export function parseDuration(input: string): number | null | undefined {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (["vv", "vinhvien", "vĩnhviễn", "perm", "forever", "lifetime"].includes(s)) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)(h|g|gio|giờ|d|n|ngay|ngày|w|tuan|tuần|m|thang|tháng)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(",", "."));
  const unit = m[2] ?? "d";
  let hours: number;
  if (["h", "g", "gio", "giờ"].includes(unit)) hours = n;
  else if (["w", "tuan", "tuần"].includes(unit)) hours = n * 24 * 7;
  else if (["m", "thang", "tháng"].includes(unit)) hours = n * 24 * 30;
  else hours = n * 24;
  if (!Number.isFinite(hours) || hours < 1) return undefined; // tối thiểu 1 giờ
  hours = Math.round(hours);
  if (hours > 24 * 365 * 20) return undefined;
  return hours;
}

export function formatDuration(hours: number | null): string {
  if (hours === null) return "Vĩnh viễn";
  if (hours < 24) return `${hours} giờ`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d} ngày ${h} giờ` : `${d} ngày`;
}

export function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}
