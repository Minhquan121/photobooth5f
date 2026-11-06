import type { Config } from "@netlify/functions";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { licenseKeys } from "../../db/schema.js";
import { formatDate, formatDuration, generateKey, normalizeKey, parseDuration } from "../../db/keys.js";
import { adminIds, botToken, esc, tg, webhookSecret } from "../../db/telegram.js";

const PRESETS: [string, string][] = [
  ["1 giờ", "1"], ["3 giờ", "3"], ["6 giờ", "6"], ["12 giờ", "12"],
  ["1 ngày", "24"], ["3 ngày", "72"], ["7 ngày", "168"], ["15 ngày", "360"],
  ["30 ngày", "720"], ["90 ngày", "2160"], ["365 ngày", "8760"], ["♾ Vĩnh viễn", "perm"],
];

const durationKeyboard = () => {
  const rows = [];
  for (let i = 0; i < PRESETS.length; i += 4)
    rows.push(PRESETS.slice(i, i + 4).map(([text, v]) => ({ text, callback_data: `gen:${v}` })));
  return { inline_keyboard: rows };
};

const HELP = `<b>🔑 Bot quản lý key Photobooth</b>

<b>Tạo key</b>
/taokey — chọn thời hạn bằng nút bấm
/taokey &lt;thời hạn&gt; [số lượng] [ghi chú]
  Ví dụ: <code>/taokey 1h</code>, <code>/taokey 12h</code>, <code>/taokey 7d 5</code>, <code>/taokey 30 1 Khách A</code>, <code>/taokey vv</code>
  Đơn vị: <b>h</b> giờ, <b>d</b> ngày, <b>w</b> tuần, <b>m</b> tháng (30 ngày), số trơn = ngày, <b>vv</b> = vĩnh viễn.
  Thời hạn tối thiểu: <b>1 giờ</b>. Thời hạn bắt đầu tính khi key được nhập lần đầu.

<b>Quản lý</b>
/dskey — 20 key mới nhất
/key &lt;key&gt; — xem thông tin key
/giahan &lt;key&gt; &lt;thời hạn&gt; — cộng thêm thời hạn
/resetkey &lt;key&gt; — gỡ thiết bị (cho phép dùng trên máy khác)
/xoakey &lt;key&gt; — khoá key
/mokey &lt;key&gt; — mở khoá key
/id — xem Telegram ID của bạn`;

function statusOf(r: typeof licenseKeys.$inferSelect): string {
  if (r.revoked) return "⛔ Đã khoá";
  if (!r.activatedAt) return "🆕 Chưa kích hoạt";
  if (r.expiresAt && r.expiresAt.getTime() <= Date.now()) return "⌛ Hết hạn";
  return "✅ Đang dùng";
}

function keyInfo(r: typeof licenseKeys.$inferSelect): string {
  return [
    `🔑 <code>${esc(r.key)}</code>`,
    `Trạng thái: ${statusOf(r)}`,
    `Thời hạn: ${formatDuration(r.durationHours)}`,
    r.note ? `Ghi chú: ${esc(r.note)}` : "",
    `Tạo lúc: ${formatDate(r.createdAt)}`,
    `Kích hoạt: ${formatDate(r.activatedAt)}`,
    `Hết hạn: ${r.activatedAt ? (r.expiresAt ? formatDate(r.expiresAt) : "Không bao giờ") : "—"}`,
    `Thiết bị: ${r.deviceId ? "Đã gắn" : "Chưa gắn"}`,
  ].filter(Boolean).join("\n");
}

async function createKeys(hours: number | null, count: number, note: string | null, by: string) {
  const values = Array.from({ length: count }, () => ({
    key: generateKey(), durationHours: hours, note, createdBy: by,
  }));
  const rows = await db.insert(licenseKeys).values(values).returning();
  const list = rows.map((r) => `<code>${esc(r.key)}</code>`).join("\n");
  return `✅ Đã tạo ${rows.length} key — thời hạn <b>${formatDuration(hours)}</b>${note ? `\nGhi chú: ${esc(note)}` : ""}\n\n${list}\n\n<i>Bấm vào key để sao chép. Thời hạn tính từ lần nhập đầu tiên.</i>`;
}

async function findKey(raw: string) {
  const key = normalizeKey(raw);
  if (!key) return null;
  const [row] = await db.select().from(licenseKeys).where(eq(licenseKeys.key, key)).limit(1);
  return row ?? null;
}

async function handleCommand(text: string, from: string): Promise<{ text: string; reply_markup?: unknown }> {
  const [cmdRaw, ...args] = text.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@.*$/, "");

  switch (cmd) {
    case "/start":
    case "/help":
      return { text: HELP, reply_markup: durationKeyboard() };

    case "/taokey":
    case "/tao":
    case "/genkey": {
      if (!args.length) return { text: "⏱ Chọn thời hạn cho key:", reply_markup: durationKeyboard() };
      const hours = parseDuration(args[0]);
      if (hours === undefined)
        return { text: "❌ Thời hạn không hợp lệ (tối thiểu 1 giờ). Ví dụ: <code>1h</code>, <code>12h</code>, <code>7d</code>, <code>1m</code>, <code>vv</code>" };
      let count = 1;
      let noteParts = args.slice(1);
      if (noteParts[0] && /^\d+$/.test(noteParts[0])) {
        count = parseInt(noteParts[0], 10);
        noteParts = noteParts.slice(1);
      }
      if (count < 1 || count > 50) return { text: "❌ Số lượng từ 1 đến 50." };
      const note = noteParts.join(" ").slice(0, 200) || null;
      return { text: await createKeys(hours, count, note, from) };
    }

    case "/dskey":
    case "/list": {
      const rows = await db.select().from(licenseKeys).orderBy(desc(licenseKeys.createdAt)).limit(20);
      if (!rows.length) return { text: "Chưa có key nào." };
      const lines = rows.map((r) =>
        `${statusOf(r).split(" ")[0]} <code>${esc(r.key)}</code> · ${formatDuration(r.durationHours)}${
          r.expiresAt ? ` · HH ${formatDate(r.expiresAt)}` : ""}${r.note ? ` · ${esc(r.note)}` : ""}`);
      return { text: `<b>20 key mới nhất</b>\n\n${lines.join("\n")}` };
    }

    case "/key":
    case "/check": {
      const r = await findKey(args[0] ?? "");
      return { text: r ? keyInfo(r) : "❌ Không tìm thấy key." };
    }

    case "/giahan": {
      const r = await findKey(args[0] ?? "");
      if (!r) return { text: "❌ Không tìm thấy key. Cú pháp: <code>/giahan PB-XXXX-XXXX-XXXX 7d</code>" };
      const hours = parseDuration(args[1] ?? "");
      if (hours === undefined) return { text: "❌ Thời hạn không hợp lệ (tối thiểu 1 giờ)." };
      let patch: Partial<typeof licenseKeys.$inferInsert>;
      if (hours === null) patch = { durationHours: null, expiresAt: null };
      else if (r.durationHours === null) return { text: "ℹ️ Key này đã là vĩnh viễn." };
      else if (!r.activatedAt) patch = { durationHours: r.durationHours + hours };
      else {
        const base = Math.max(Date.now(), r.expiresAt?.getTime() ?? Date.now());
        patch = { durationHours: r.durationHours + hours, expiresAt: new Date(base + hours * 3600_000) };
      }
      const [u] = await db.update(licenseKeys).set(patch).where(eq(licenseKeys.id, r.id)).returning();
      return { text: `✅ Đã gia hạn.\n\n${keyInfo(u)}` };
    }

    case "/resetkey": {
      const r = await findKey(args[0] ?? "");
      if (!r) return { text: "❌ Không tìm thấy key." };
      const [u] = await db.update(licenseKeys).set({ deviceId: null }).where(eq(licenseKeys.id, r.id)).returning();
      return { text: `✅ Đã gỡ thiết bị. Key có thể nhập trên thiết bị mới.\n\n${keyInfo(u)}` };
    }

    case "/xoakey":
    case "/khoakey": {
      const r = await findKey(args[0] ?? "");
      if (!r) return { text: "❌ Không tìm thấy key." };
      await db.update(licenseKeys).set({ revoked: true }).where(eq(licenseKeys.id, r.id));
      return { text: `⛔ Đã khoá key <code>${esc(r.key)}</code>` };
    }

    case "/mokey": {
      const r = await findKey(args[0] ?? "");
      if (!r) return { text: "❌ Không tìm thấy key." };
      await db.update(licenseKeys).set({ revoked: false }).where(eq(licenseKeys.id, r.id));
      return { text: `✅ Đã mở khoá key <code>${esc(r.key)}</code>` };
    }

    default:
      return { text: "Lệnh không hợp lệ. Gõ /help để xem hướng dẫn." };
  }
}

export default async (req: Request) => {
  if (!botToken()) return new Response("Bot chưa được cấu hình", { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret())
    return new Response("Forbidden", { status: 403 });

  const update: any = await req.json().catch(() => null);
  if (!update) return new Response("ok");

  try {
    // Bấm nút chọn thời hạn
    if (update.callback_query) {
      const cq = update.callback_query;
      const from = String(cq.from?.id ?? "");
      const chatId = cq.message?.chat?.id;
      if (!adminIds().includes(from)) {
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Bạn không có quyền.", show_alert: true });
        return new Response("ok");
      }
      const data = String(cq.data ?? "");
      if (data.startsWith("gen:")) {
        const v = data.slice(4);
        const hours = v === "perm" ? null : parseInt(v, 10);
        if (hours !== null && (!Number.isFinite(hours) || hours < 1)) {
          await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Thời hạn không hợp lệ" });
          return new Response("ok");
        }
        const text = await createKeys(hours, 1, null, from);
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Đã tạo key" });
        await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", reply_markup: durationKeyboard() });
      } else {
        await tg("answerCallbackQuery", { callback_query_id: cq.id });
      }
      return new Response("ok");
    }

    const msg = update.message;
    const text: string | undefined = msg?.text;
    if (!msg || !text) return new Response("ok");
    const from = String(msg.from?.id ?? "");
    const chatId = msg.chat.id;

    if (text.trim().toLowerCase().startsWith("/id")) {
      await tg("sendMessage", { chat_id: chatId, text: `Telegram ID của bạn: <code>${esc(from)}</code>`, parse_mode: "HTML" });
      return new Response("ok");
    }
    if (!adminIds().includes(from)) {
      await tg("sendMessage", {
        chat_id: chatId, parse_mode: "HTML",
        text: `⛔ Bạn không có quyền dùng bot này.\nTelegram ID của bạn: <code>${esc(from)}</code>`,
      });
      return new Response("ok");
    }
    if (!text.startsWith("/")) {
      await tg("sendMessage", { chat_id: chatId, text: "⏱ Chọn thời hạn để tạo key, hoặc gõ /help.", reply_markup: durationKeyboard() });
      return new Response("ok");
    }
    const reply = await handleCommand(text, from);
    await tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", ...reply });
  } catch (err) {
    console.error("telegram webhook error", err);
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (chatId) await tg("sendMessage", { chat_id: chatId, text: "⚠️ Có lỗi xảy ra, vui lòng thử lại." });
  }
  // Luôn trả 200 để Telegram không gửi lại update
  return new Response("ok");
};

export const config: Config = {
  path: "/api/telegram",
  method: "POST",
};
