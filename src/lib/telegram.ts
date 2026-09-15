const TELEGRAM_API = "https://api.telegram.org";

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
}

function chatId() {
  return process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
}

export function telegramConfigured() {
  return Boolean(botToken() && chatId());
}

export async function sendTelegramMessage(
  text: string,
  opts?: { parseMode?: "HTML" | "Markdown" },
) {
  const token = botToken();
  const chat = chatId();
  if (!token || !chat) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
  }

  // Telegram hard limit is 4096; keep a safety margin
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 3900) {
    let cut = remaining.lastIndexOf("\n\n", 3900);
    if (cut < 500) cut = 3900;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);

  const results = [];
  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: chunk,
        disable_web_page_preview: true,
        ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!res.ok || !json.ok) {
      throw new Error(json.description ?? `Telegram HTTP ${res.status}`);
    }
    results.push(json);
  }
  return results;
}
