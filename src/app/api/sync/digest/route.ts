import { NextResponse } from "next/server";
import { runDailyDeviceDigest } from "@/lib/daily-digest";
import { createDailyDigest } from "@/lib/omniroute";
import { sendTelegramMessage, telegramConfigured } from "@/lib/telegram";

/**
 * POST /api/sync/digest
 * body: { test?: boolean, force?: boolean, sendTelegram?: boolean }
 *
 * test=true → probe OmniRoute + send a short Telegram ping (no DB digest)
 * force=true → build + send daily digest now (ignore schedule / already-sent)
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      test?: boolean;
      force?: boolean;
      sendTelegram?: boolean;
    };

    if (body.test) {
      const omni = await createDailyDigest(
        "Reply with exactly one short sentence confirming OmniRoute is working for KidsNet digests.",
      );

      let telegram: { ok: boolean; detail: string } = {
        ok: false,
        detail: "TELEGRAM_* not configured",
      };
      if (telegramConfigured()) {
        await sendTelegramMessage(
          [
            "✅ KidsNet test",
            "",
            `OmniRoute: ${omni}`,
            "",
            "Daily device digests will arrive here each evening.",
          ].join("\n"),
        );
        telegram = { ok: true, detail: "message sent" };
      }

      return NextResponse.json({
        ok: true,
        mode: "test",
        omniroute: omni,
        telegram,
      });
    }

    const result = await runDailyDeviceDigest({
      force: body.force ?? true,
      sendTelegram: body.sendTelegram ?? true,
    });
    return NextResponse.json({ ok: true, mode: "digest", ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "digest failed",
      },
      { status: 500 },
    );
  }
}
