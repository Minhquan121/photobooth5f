import type { Config } from "@netlify/functions";
import { botToken, tg, webhookSecret } from "../../db/telegram.js";

// Mở /api/telegram/setup một lần (trên domain chính) để kết nối bot Telegram với server.
export default async (req: Request) => {
  if (!botToken()) return Response.json({ ok: false, message: "Thiếu TELEGRAM_BOT_TOKEN" }, { status: 503 });
  const origin = new URL(req.url).origin;
  const webhookUrl = `${origin}/api/telegram`;

  const hook = await tg("setWebhook", {
    url: webhookUrl,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await tg("setMyCommands", {
    commands: [
      { command: "taokey", description: "Tạo key (chọn thời hạn)" },
      { command: "dskey", description: "Danh sách key mới nhất" },
      { command: "key", description: "Xem thông tin key" },
      { command: "giahan", description: "Gia hạn key" },
      { command: "resetkey", description: "Gỡ thiết bị khỏi key" },
      { command: "xoakey", description: "Khoá key" },
      { command: "mokey", description: "Mở khoá key" },
      { command: "id", description: "Xem Telegram ID" },
      { command: "help", description: "Hướng dẫn" },
    ],
  });
  const me = await tg("getMe", {});

  return Response.json({
    ok: !!hook.ok,
    message: hook.ok ? "Đã kết nối bot Telegram thành công" : "Kết nối thất bại",
    bot: me?.result?.username ? `@${me.result.username}` : null,
    webhook: webhookUrl,
    detail: hook.description ?? null,
  });
};

export const config: Config = {
  path: "/api/telegram/setup",
};
